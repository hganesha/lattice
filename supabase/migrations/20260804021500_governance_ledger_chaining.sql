-- Hash-chained governance ledgers in Postgres.
--
-- The file-backed stores chain every artifact to its predecessor so that removing, reordering, or
-- editing a record stops the chain verifying. Moving those stores to Postgres has to preserve
-- that property, and a naive insert cannot: reading the current head and then inserting the next
-- link are two statements, so two concurrent appends both read sequence N and both write N. The
-- chain forks and neither branch is detectably wrong.
--
-- Two things close that. A unique constraint on the sequence makes a fork impossible to store at
-- all, and an append function computes the link and inserts it in a single statement so the head
-- cannot move in between.

alter table public.governed_artifacts
  add column chain_sequence bigint,
  add column previous_digest text,
  add column chain_digest text;

alter table public.connector_health
  add column chain_sequence bigint,
  add column previous_digest text,
  add column chain_digest text;

-- Chains are per organization and per artifact kind, not global.
--
-- Row level security means a member only ever reads their own organization's rows, so a chain
-- spanning organizations could never be verified by anyone able to read it: the predecessor of
-- any given link would usually be invisible. Scoping the chain to the tenant keeps it verifiable
-- by the tenant, which is the whole point of publishing one.
create unique index governed_artifacts_chain_idx
  on public.governed_artifacts (organization_id, kind, chain_sequence)
  where chain_sequence is not null;

create unique index connector_health_chain_idx
  on public.connector_health (organization_id, chain_sequence)
  where chain_sequence is not null;

/**
 * Appends one governance artifact, deriving its chain link from the current head.
 *
 * Security definer because it writes columns the caller must not choose: picking your own
 * sequence or predecessor is precisely the tampering the chain exists to detect. Membership and
 * role are still checked explicitly against the calling user, so this grants no authority beyond
 * what the table policies already allow.
 */
create or replace function public.append_governed_artifact(
  target_organization_id uuid,
  target_contract_id text,
  target_kind text,
  target_id text,
  target_artifact_digest text,
  target_document jsonb
)
returns public.governed_artifacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  head_digest text;
  head_sequence bigint;
  next_sequence bigint;
  computed_digest text;
  inserted public.governed_artifacts;
begin
  if not public.is_organization_member(
    target_organization_id,
    array['OWNER', 'ADMIN', 'AUTHOR', 'REVIEWER', 'OPERATOR']::public.organization_role[]
  ) then
    raise exception 'GOVERNED_ARTIFACT_FORBIDDEN' using errcode = '42501';
  end if;

  -- Locks the tail so a concurrent append blocks here rather than duplicating the sequence.
  select artifact.chain_digest, artifact.chain_sequence
    into head_digest, head_sequence
  from public.governed_artifacts artifact
  where artifact.organization_id = target_organization_id
    and artifact.kind = target_kind
    and artifact.chain_sequence is not null
  order by artifact.chain_sequence desc
  limit 1
  for update;

  next_sequence := coalesce(head_sequence + 1, 0);
  head_digest := coalesce(head_digest, 'sha256:genesis');

  -- Mirrors linkArtifact() in apps/api/src/hashChain.ts. The two must agree exactly, or an
  -- artifact written here will not verify in the API and vice versa.
  computed_digest := 'sha256:' || encode(
    extensions.digest(head_digest || ' ' || target_artifact_digest || ' ' || next_sequence::text, 'sha256'),
    'hex'
  );

  insert into public.governed_artifacts (
    organization_id, id, contract_id, kind, artifact_digest, document,
    created_by, chain_sequence, previous_digest, chain_digest
  )
  values (
    target_organization_id, target_id, target_contract_id, target_kind, target_artifact_digest,
    target_document, auth.uid(), next_sequence, head_digest, computed_digest
  )
  returning * into inserted;

  return inserted;
end;
$$;

revoke all on function public.append_governed_artifact(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.append_governed_artifact(uuid, text, text, text, text, jsonb) to authenticated;

/** The same append, for the connector health ledger, which is not scoped to a contract. */
create or replace function public.append_connector_health(
  target_organization_id uuid,
  target_id text,
  target_binding_id text,
  target_provider text,
  target_status text,
  target_document jsonb
)
returns public.connector_health
language plpgsql
security definer
set search_path = ''
as $$
declare
  head_digest text;
  head_sequence bigint;
  next_sequence bigint;
  computed_digest text;
  artifact_digest text;
  inserted public.connector_health;
begin
  if not public.is_organization_member(
    target_organization_id,
    array['OWNER', 'ADMIN', 'AUTHOR', 'OPERATOR']::public.organization_role[]
  ) then
    raise exception 'CONNECTOR_HEALTH_FORBIDDEN' using errcode = '42501';
  end if;

  select health.chain_digest, health.chain_sequence
    into head_digest, head_sequence
  from public.connector_health health
  where health.organization_id = target_organization_id
    and health.chain_sequence is not null
  order by health.chain_sequence desc
  limit 1
  for update;

  next_sequence := coalesce(head_sequence + 1, 0);
  head_digest := coalesce(head_digest, 'sha256:genesis');
  artifact_digest := 'sha256:' || encode(extensions.digest(target_document::text, 'sha256'), 'hex');

  computed_digest := 'sha256:' || encode(
    extensions.digest(head_digest || ' ' || artifact_digest || ' ' || next_sequence::text, 'sha256'),
    'hex'
  );

  insert into public.connector_health (
    organization_id, id, binding_id, provider, status, document,
    checked_by, chain_sequence, previous_digest, chain_digest
  )
  values (
    target_organization_id, target_id, target_binding_id, target_provider, target_status,
    target_document, auth.uid(), next_sequence, head_digest, computed_digest
  )
  returning * into inserted;

  return inserted;
end;
$$;

revoke all on function public.append_connector_health(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.append_connector_health(uuid, text, text, text, text, jsonb) to authenticated;
