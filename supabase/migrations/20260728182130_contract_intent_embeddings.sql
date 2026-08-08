-- Release-scoped semantic intent index for Context API routing.
--
-- The embedding profile is intentionally pinned per immutable contract release.
-- Changing provider, model, or dimensions requires publishing a new release so
-- an active release can never contain vectors from different embedding spaces.
--
-- Post-migration provisioning (values are deliberately not version controlled):
--   1. Add lattice_project_url, lattice_publishable_key, and
--      lattice_embedding_worker_token to Supabase Vault.
--   2. Add OPENROUTER_API_KEY and LATTICE_EMBEDDING_WORKER_TOKEN to Supabase
--      Edge Function secrets. The latter must equal the Vault worker token.
--   3. Deploy the JWT-protected embed-contract-intents Edge Function.

create extension if not exists vector
with
  schema extensions;

create extension if not exists pgmq;

create extension if not exists pg_net
with
  schema extensions;

create extension if not exists pg_cron;

create extension if not exists pgcrypto
with
  schema extensions;

create schema if not exists lattice_private;

revoke all on schema lattice_private from public;
revoke all on schema lattice_private from anon;
revoke all on schema lattice_private from authenticated;

create table if not exists public.contract_intent_indexes (
  organization_id uuid not null,
  contract_id text not null,
  release_digest text not null check (release_digest like 'sha256:%'),
  provider text not null default 'openrouter'
    check (length(trim(provider)) between 1 and 120),
  model text not null default 'openai/text-embedding-3-small'
    check (length(trim(model)) between 1 and 240),
  dimensions integer not null default 1536
    check (dimensions = 1536),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'READY', 'FAILED')),
  expected_document_count integer not null
    check (expected_document_count between 1 and 10000),
  embedded_document_count integer not null default 0
    check (embedded_document_count >= 0),
  failed_document_count integer not null default 0
    check (failed_document_count >= 0),
  index_digest text
    check (index_digest is null or index_digest like 'sha256:%'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz,
  primary key (organization_id, contract_id, release_digest),
  foreign key (organization_id, contract_id, release_digest)
    references public.contract_releases(organization_id, contract_id, digest)
    on delete cascade,
  check (
    (status = 'READY' and index_digest is not null and ready_at is not null)
    or status <> 'READY'
  )
);

create index if not exists contract_intent_indexes_status_idx
  on public.contract_intent_indexes (
    organization_id,
    contract_id,
    release_digest,
    status
  );

create table if not exists public.contract_intent_documents (
  organization_id uuid not null,
  id uuid not null default gen_random_uuid(),
  contract_id text not null,
  release_digest text not null check (release_digest like 'sha256:%'),
  document_key text not null
    check (length(trim(document_key)) between 1 and 240),
  document_kind text not null
    check (document_kind in ('OPERATION', 'QUESTION', 'EXAMPLE')),
  operation_id text not null
    check (length(trim(operation_id)) between 1 and 240),
  question_id text,
  content text not null
    check (length(trim(content)) between 1 and 50000),
  content_hash text generated always as (
    'sha256:' || encode(extensions.digest(content, 'sha256'), 'hex')
  ) stored,
  embedding extensions.halfvec(1536),
  embedding_status text not null default 'PENDING'
    check (embedding_status in ('PENDING', 'PROCESSING', 'READY', 'FAILED')),
  embedding_attempt_count integer not null default 0
    check (embedding_attempt_count >= 0),
  embedding_error text,
  embedded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (
    organization_id,
    contract_id,
    release_digest,
    document_key
  ),
  foreign key (organization_id, contract_id, release_digest)
    references public.contract_intent_indexes(
      organization_id,
      contract_id,
      release_digest
    )
    on delete cascade,
  check (
    (document_kind = 'QUESTION' and question_id is not null)
    or (document_kind <> 'QUESTION' and question_id is null)
  ),
  check (
    (embedding_status = 'READY' and embedding is not null and embedded_at is not null)
    or embedding_status <> 'READY'
  )
);

-- Intent searches are always narrowed to one release, which contains a small
-- governed document set. A B-tree filter plus exact cosine scan avoids the
-- filtered-result caveat of approximate HNSW indexes. Add HNSW only after
-- production volume demonstrates that an approximate global index is needed.
create index if not exists contract_intent_documents_release_idx
  on public.contract_intent_documents (
    organization_id,
    contract_id,
    release_digest,
    embedding_status
  );

create or replace function lattice_private.prepare_contract_intent_document()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.content is distinct from old.content then
    new.embedding := null;
    new.embedding_status := 'PENDING';
    new.embedding_attempt_count := 0;
    new.embedding_error := null;
    new.embedded_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function lattice_private.prepare_contract_intent_document()
  from public;
revoke all on function lattice_private.prepare_contract_intent_document()
  from anon;
revoke all on function lattice_private.prepare_contract_intent_document()
  from authenticated;

drop trigger if exists prepare_contract_intent_document
  on public.contract_intent_documents;

create trigger prepare_contract_intent_document
before insert or update of content
on public.contract_intent_documents
for each row
execute function lattice_private.prepare_contract_intent_document();

do $queue_setup$
begin
  if not exists (
    select 1
    from pgmq.list_queues() queue
    where queue.queue_name = 'contract_intent_embedding_jobs'
  ) then
    perform pgmq.create('contract_intent_embedding_jobs');
  end if;
end;
$queue_setup$;

create or replace function lattice_private.enqueue_contract_intent_embedding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pgmq.send(
    queue_name => 'contract_intent_embedding_jobs',
    msg => jsonb_build_object(
      'organizationId', new.organization_id,
      'contractId', new.contract_id,
      'releaseDigest', new.release_digest,
      'documentId', new.id,
      'contentHash', new.content_hash
    )
  );
  return new;
end;
$$;

revoke all on function lattice_private.enqueue_contract_intent_embedding()
  from public;
revoke all on function lattice_private.enqueue_contract_intent_embedding()
  from anon;
revoke all on function lattice_private.enqueue_contract_intent_embedding()
  from authenticated;

drop trigger if exists enqueue_contract_intent_embedding
  on public.contract_intent_documents;

create trigger enqueue_contract_intent_embedding
after insert or update of content
on public.contract_intent_documents
for each row
execute function lattice_private.enqueue_contract_intent_embedding();

create or replace function lattice_private.refresh_contract_intent_index(
  target_organization_id uuid,
  target_contract_id text,
  target_release_digest text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_count integer;
  document_count integer;
  ready_count integer;
  failed_count integer;
  selected_model text;
  selected_dimensions integer;
  calculated_digest text;
  calculated_status text;
begin
  select
    intent_index.expected_document_count,
    intent_index.model,
    intent_index.dimensions
  into
    expected_count,
    selected_model,
    selected_dimensions
  from public.contract_intent_indexes intent_index
  where intent_index.organization_id = target_organization_id
    and intent_index.contract_id = target_contract_id
    and intent_index.release_digest = target_release_digest;

  if not found then
    return;
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where document.embedding_status = 'READY'
        and document.embedding is not null
    )::integer,
    count(*) filter (
      where document.embedding_status = 'FAILED'
    )::integer
  into
    document_count,
    ready_count,
    failed_count
  from public.contract_intent_documents document
  where document.organization_id = target_organization_id
    and document.contract_id = target_contract_id
    and document.release_digest = target_release_digest;

  calculated_status := case
    when failed_count > 0 then 'FAILED'
    when document_count = expected_count and ready_count = expected_count then 'READY'
    else 'PENDING'
  end;

  if calculated_status = 'READY' then
    select
      'sha256:' || encode(
        extensions.digest(
          selected_model
          || ':'
          || selected_dimensions::text
          || ':'
          || coalesce(
            string_agg(
              document.document_key
              || ':'
              || document.content_hash
              || ':'
              || document.embedding::text,
              '|'
              order by document.document_key
            ),
            ''
          ),
          'sha256'
        ),
        'hex'
      )
    into calculated_digest
    from public.contract_intent_documents document
    where document.organization_id = target_organization_id
      and document.contract_id = target_contract_id
      and document.release_digest = target_release_digest;
  else
    calculated_digest := null;
  end if;

  update public.contract_intent_indexes intent_index
  set
    status = calculated_status,
    embedded_document_count = ready_count,
    failed_document_count = failed_count,
    index_digest = calculated_digest,
    ready_at = case
      when calculated_status = 'READY' then coalesce(intent_index.ready_at, now())
      else null
    end,
    updated_at = now()
  where intent_index.organization_id = target_organization_id
    and intent_index.contract_id = target_contract_id
    and intent_index.release_digest = target_release_digest;
end;
$$;

revoke all on function lattice_private.refresh_contract_intent_index(
  uuid,
  text,
  text
) from public;
revoke all on function lattice_private.refresh_contract_intent_index(
  uuid,
  text,
  text
) from anon;
revoke all on function lattice_private.refresh_contract_intent_index(
  uuid,
  text,
  text
) from authenticated;

create or replace function lattice_private.refresh_contract_intent_index_from_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform lattice_private.refresh_contract_intent_index(
      old.organization_id,
      old.contract_id,
      old.release_digest
    );
    return old;
  end if;

  perform lattice_private.refresh_contract_intent_index(
    new.organization_id,
    new.contract_id,
    new.release_digest
  );
  return new;
end;
$$;

revoke all on function lattice_private.refresh_contract_intent_index_from_document()
  from public;
revoke all on function lattice_private.refresh_contract_intent_index_from_document()
  from anon;
revoke all on function lattice_private.refresh_contract_intent_index_from_document()
  from authenticated;

drop trigger if exists refresh_contract_intent_index_from_document
  on public.contract_intent_documents;

create trigger refresh_contract_intent_index_from_document
after insert or delete or update of embedding, embedding_status
on public.contract_intent_documents
for each row
execute function lattice_private.refresh_contract_intent_index_from_document();

create or replace function lattice_private.process_contract_intent_embeddings(
  batch_size integer default 20,
  visibility_timeout_seconds integer default 300,
  timeout_milliseconds integer default 280000
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_url text;
  publishable_key text;
  worker_token text;
  jobs jsonb;
begin
  if batch_size < 1 or batch_size > 100 then
    raise exception using
      errcode = '22023',
      message = 'batch_size must be between 1 and 100.';
  end if;

  select secret.decrypted_secret
  into project_url
  from vault.decrypted_secrets secret
  where secret.name = 'lattice_project_url'
  limit 1;

  select secret.decrypted_secret
  into publishable_key
  from vault.decrypted_secrets secret
  where secret.name = 'lattice_publishable_key'
  limit 1;

  select secret.decrypted_secret
  into worker_token
  from vault.decrypted_secrets secret
  where secret.name = 'lattice_embedding_worker_token'
  limit 1;

  -- Allow migrations and local development to start before runtime secrets are
  -- provisioned. Jobs remain visible and will be processed after configuration.
  if project_url is null or publishable_key is null or worker_token is null then
    return;
  end if;

  select coalesce(
    jsonb_agg(
      queued.message || jsonb_build_object('jobId', queued.msg_id)
      order by queued.msg_id
    ),
    '[]'::jsonb
  )
  into jobs
  from pgmq.read(
    queue_name => 'contract_intent_embedding_jobs',
    vt => visibility_timeout_seconds,
    qty => batch_size
  ) queued;

  if jsonb_array_length(jobs) = 0 then
    return;
  end if;

  perform net.http_post(
    url => rtrim(project_url, '/')
      || '/functions/v1/embed-contract-intents',
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || publishable_key,
      'X-Lattice-Embedding-Worker', worker_token
    ),
    body => jobs,
    timeout_milliseconds => timeout_milliseconds
  );
end;
$$;

revoke all on function lattice_private.process_contract_intent_embeddings(
  integer,
  integer,
  integer
) from public;
revoke all on function lattice_private.process_contract_intent_embeddings(
  integer,
  integer,
  integer
) from anon;
revoke all on function lattice_private.process_contract_intent_embeddings(
  integer,
  integer,
  integer
) from authenticated;

do $cron_setup$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'lattice-process-contract-intent-embeddings'
  ) then
    perform cron.schedule(
      'lattice-process-contract-intent-embeddings',
      '10 seconds',
      $cron_job$
        select lattice_private.process_contract_intent_embeddings();
      $cron_job$
    );
  end if;
end;
$cron_setup$;

alter table public.contract_intent_indexes enable row level security;
alter table public.contract_intent_documents enable row level security;

drop policy if exists "members can read contract intent indexes"
  on public.contract_intent_indexes;

create policy "members can read contract intent indexes"
on public.contract_intent_indexes for select
to authenticated
using ((select public.is_organization_member(organization_id)));

drop policy if exists "authors can create contract intent indexes"
  on public.contract_intent_indexes;

create policy "authors can create contract intent indexes"
on public.contract_intent_indexes for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'PENDING'
  and embedded_document_count = 0
  and failed_document_count = 0
  and index_digest is null
  and ready_at is null
  and (select public.is_organization_member(
    organization_id,
    array['OWNER', 'ADMIN', 'AUTHOR']::public.organization_role[]
  ))
);

drop policy if exists "members can read contract intent documents"
  on public.contract_intent_documents;

create policy "members can read contract intent documents"
on public.contract_intent_documents for select
to authenticated
using ((select public.is_organization_member(organization_id)));

drop policy if exists "authors can create contract intent documents"
  on public.contract_intent_documents;

create policy "authors can create contract intent documents"
on public.contract_intent_documents for insert
to authenticated
with check (
  embedding is null
  and embedding_status = 'PENDING'
  and embedding_attempt_count = 0
  and embedding_error is null
  and embedded_at is null
  and (select public.is_organization_member(
    organization_id,
    array['OWNER', 'ADMIN', 'AUTHOR']::public.organization_role[]
  ))
);

revoke all on table public.contract_intent_indexes from anon;
revoke all on table public.contract_intent_documents from anon;

grant select, insert on table public.contract_intent_indexes to authenticated;
grant select, insert on table public.contract_intent_documents to authenticated;

create or replace function public.match_contract_intents(
  target_organization_id uuid,
  target_contract_id text,
  target_release_digest text,
  query_embedding extensions.halfvec(1536),
  match_threshold double precision default 0,
  match_count integer default 20
)
returns table (
  operation_id text,
  question_id text,
  document_key text,
  document_kind text,
  content_hash text,
  similarity double precision,
  model text,
  index_digest text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    document.operation_id,
    document.question_id,
    document.document_key,
    document.document_kind,
    document.content_hash,
    1 - (
      document.embedding
      operator(extensions.<=>)
      query_embedding
    ) as similarity,
    intent_index.model,
    intent_index.index_digest
  from public.contract_intent_documents document
  join public.contract_intent_indexes intent_index
    on intent_index.organization_id = document.organization_id
   and intent_index.contract_id = document.contract_id
   and intent_index.release_digest = document.release_digest
  where document.organization_id = target_organization_id
    and document.contract_id = target_contract_id
    and document.release_digest = target_release_digest
    and document.embedding_status = 'READY'
    and document.embedding is not null
    and intent_index.status = 'READY'
    and 1 - (
      document.embedding
      operator(extensions.<=>)
      query_embedding
    )
      >= greatest(-1, least(1, coalesce(match_threshold, 0)))
  order by
    document.embedding
    operator(extensions.<=>)
    query_embedding
  limit least(greatest(coalesce(match_count, 20), 1), 200);
$$;

revoke all on function public.match_contract_intents(
  uuid,
  text,
  text,
  extensions.halfvec,
  double precision,
  integer
) from public;
revoke all on function public.match_contract_intents(
  uuid,
  text,
  text,
  extensions.halfvec,
  double precision,
  integer
) from anon;
grant execute on function public.match_contract_intents(
  uuid,
  text,
  text,
  extensions.halfvec,
  double precision,
  integer
) to authenticated;

comment on table public.contract_intent_indexes is
  'Release-pinned embedding profile and readiness state for governed intent routing.';

comment on table public.contract_intent_documents is
  'Release-scoped operation, competency-question, and curated-example embeddings.';

comment on function public.match_contract_intents(
  uuid,
  text,
  text,
  extensions.halfvec,
  double precision,
  integer
) is
  'Tenant-scoped exact cosine search over a READY contract intent index.';

comment on function lattice_private.process_contract_intent_embeddings(
  integer,
  integer,
  integer
) is
  'Internal cron worker. Requires lattice_project_url, lattice_publishable_key, and lattice_embedding_worker_token in Vault.';
