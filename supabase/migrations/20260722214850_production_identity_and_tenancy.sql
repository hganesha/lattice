create type public.organization_role as enum (
  'OWNER',
  'ADMIN',
  'AUTHOR',
  'REVIEWER',
  'OPERATOR',
  'VIEWER'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 1 and 160),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_memberships_user_id_idx
  on public.organization_memberships (user_id, organization_id);

create function public.create_organization(
  organization_name text,
  organization_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  new_organization_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if length(trim(organization_name)) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'Organization name is invalid.';
  end if;
  if organization_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(organization_slug) > 80 then
    raise exception using errcode = '22023', message = 'Organization slug is invalid.';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (trim(organization_name), organization_slug, actor_id)
  returning id into new_organization_id;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (new_organization_id, actor_id, 'OWNER');

  return new_organization_id;
end;
$$;

revoke all on function public.create_organization(text, text) from public;
revoke all on function public.create_organization(text, text) from anon;
grant execute on function public.create_organization(text, text) to authenticated;

create function public.is_organization_member(
  target_organization_id uuid,
  allowed_roles public.organization_role[] default null
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and (allowed_roles is null or membership.role = any(allowed_roles))
  );
$$;

revoke all on function public.is_organization_member(uuid, public.organization_role[]) from public;
grant execute on function public.is_organization_member(uuid, public.organization_role[]) to authenticated;

create table public.workspaces (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  domain text not null,
  name text not null,
  document jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id)
);

create table public.contracts (
  organization_id uuid not null,
  id text not null,
  workspace_id text not null,
  name text not null,
  domain text not null,
  draft jsonb not null,
  runtime_status text not null default 'NO_RELEASE'
    check (runtime_status in ('NO_RELEASE', 'ACTIVE', 'SUSPENDED')),
  active_release_digest text,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, workspace_id)
    references public.workspaces(organization_id, id) on delete cascade
);

create index contracts_workspace_idx on public.contracts (organization_id, workspace_id);

create table public.contract_releases (
  organization_id uuid not null,
  contract_id text not null,
  digest text not null check (digest like 'sha256:%'),
  version text not null,
  notes text not null,
  contract jsonb not null,
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(),
  primary key (organization_id, contract_id, digest),
  foreign key (organization_id, contract_id)
    references public.contracts(organization_id, id) on delete cascade
);

create index contract_releases_version_idx
  on public.contract_releases (organization_id, contract_id, published_at desc);

create table public.governed_artifacts (
  organization_id uuid not null,
  id text not null,
  contract_id text not null,
  kind text not null check (kind in (
    'ASSURANCE_RUN',
    'REVIEW',
    'RUNTIME_APPROVAL',
    'EXECUTION_RECEIPT',
    'RELEASE_EVENT'
  )),
  artifact_digest text not null check (artifact_digest like 'sha256:%'),
  document jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, artifact_digest),
  foreign key (organization_id, contract_id)
    references public.contracts(organization_id, id) on delete cascade
);

create index governed_artifacts_contract_idx
  on public.governed_artifacts (organization_id, contract_id, kind, created_at desc);

create table public.connector_health (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  binding_id text not null,
  provider text not null,
  status text not null check (status in ('HEALTHY', 'DEGRADED', 'UNHEALTHY')),
  document jsonb not null,
  checked_by uuid not null references auth.users(id),
  checked_at timestamptz not null default now(),
  primary key (organization_id, id)
);

create index connector_health_binding_idx
  on public.connector_health (organization_id, binding_id, checked_at desc);

create table public.audit_events (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id bigint generated always as identity,
  actor_id uuid not null references auth.users(id),
  action text not null,
  target_kind text not null,
  target_id text not null,
  artifact_digest text check (artifact_digest is null or artifact_digest like 'sha256:%'),
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  primary key (organization_id, id)
);

create index audit_events_target_idx
  on public.audit_events (organization_id, target_kind, target_id, occurred_at desc);

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.workspaces enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_releases enable row level security;
alter table public.governed_artifacts enable row level security;
alter table public.connector_health enable row level security;
alter table public.audit_events enable row level security;

create policy "organization members can read organizations"
on public.organizations for select
to authenticated
using (
  created_by = (select auth.uid())
  or (select public.is_organization_member(id))
);

create policy "organization administrators can update organizations"
on public.organizations for update
to authenticated
using ((select public.is_organization_member(id, array['OWNER', 'ADMIN']::public.organization_role[])))
with check ((select public.is_organization_member(id, array['OWNER', 'ADMIN']::public.organization_role[])));

create policy "members can read their own memberships"
on public.organization_memberships for select
to authenticated
using (user_id = (select auth.uid()));

create policy "members can read workspaces"
on public.workspaces for select
to authenticated
using ((select public.is_organization_member(organization_id)));

create policy "authors can create workspaces"
on public.workspaces for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (select public.is_organization_member(
    organization_id,
    array['OWNER', 'ADMIN', 'AUTHOR']::public.organization_role[]
  ))
);

create policy "authors can update workspaces"
on public.workspaces for update
to authenticated
using ((select public.is_organization_member(
  organization_id,
  array['OWNER', 'ADMIN', 'AUTHOR']::public.organization_role[]
)))
with check ((select public.is_organization_member(
  organization_id,
  array['OWNER', 'ADMIN', 'AUTHOR']::public.organization_role[]
)));

create policy "members can read contracts"
on public.contracts for select
to authenticated
using ((select public.is_organization_member(organization_id)));

create policy "authors can create contracts"
on public.contracts for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and (select public.is_organization_member(
    organization_id,
    array['OWNER', 'ADMIN', 'AUTHOR']::public.organization_role[]
  ))
);

create policy "authors can update contracts"
on public.contracts for update
to authenticated
using ((select public.is_organization_member(
  organization_id,
  array['OWNER', 'ADMIN', 'AUTHOR']::public.organization_role[]
)))
with check (
  updated_by = (select auth.uid())
  and (select public.is_organization_member(
    organization_id,
    array['OWNER', 'ADMIN', 'AUTHOR']::public.organization_role[]
  ))
);

create policy "members can read releases"
on public.contract_releases for select
to authenticated
using ((select public.is_organization_member(organization_id)));

create policy "authors can publish releases"
on public.contract_releases for insert
to authenticated
with check (
  published_by = (select auth.uid())
  and (select public.is_organization_member(
    organization_id,
    array['OWNER', 'ADMIN', 'AUTHOR']::public.organization_role[]
  ))
);

create policy "members can read governed artifacts"
on public.governed_artifacts for select
to authenticated
using ((select public.is_organization_member(organization_id)));

create policy "governance roles can append governed artifacts"
on public.governed_artifacts for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (select public.is_organization_member(
    organization_id,
    array['OWNER', 'ADMIN', 'AUTHOR', 'REVIEWER', 'OPERATOR']::public.organization_role[]
  ))
);

create policy "members can read connector health"
on public.connector_health for select
to authenticated
using ((select public.is_organization_member(organization_id)));

create policy "operators can append connector health"
on public.connector_health for insert
to authenticated
with check (
  checked_by = (select auth.uid())
  and (select public.is_organization_member(
    organization_id,
    array['OWNER', 'ADMIN', 'AUTHOR', 'OPERATOR']::public.organization_role[]
  ))
);

create policy "members can read audit events"
on public.audit_events for select
to authenticated
using ((select public.is_organization_member(organization_id)));

create policy "authorized roles can append audit events"
on public.audit_events for insert
to authenticated
with check (
  actor_id = (select auth.uid())
  and (select public.is_organization_member(
    organization_id,
    array['OWNER', 'ADMIN', 'AUTHOR', 'REVIEWER', 'OPERATOR']::public.organization_role[]
  ))
);

revoke all on table public.organizations from anon;
revoke all on table public.organization_memberships from anon;
revoke all on table public.workspaces from anon;
revoke all on table public.contracts from anon;
revoke all on table public.contract_releases from anon;
revoke all on table public.governed_artifacts from anon;
revoke all on table public.connector_health from anon;
revoke all on table public.audit_events from anon;

grant select, update on table public.organizations to authenticated;
grant select on table public.organization_memberships to authenticated;
grant select, insert, update on table public.workspaces to authenticated;
grant select, insert, update on table public.contracts to authenticated;
grant select, insert on table public.contract_releases to authenticated;
grant select, insert on table public.governed_artifacts to authenticated;
grant select, insert on table public.connector_health to authenticated;
grant select, insert on table public.audit_events to authenticated;
grant usage, select on sequence public.audit_events_id_seq to authenticated;

comment on table public.organization_memberships is
  'Authoritative Lattice tenant membership. Never derive authorization from user_metadata.';
comment on table public.governed_artifacts is
  'Append-only assurance, review, approval, execution, and release-control artifacts.';
comment on table public.audit_events is
  'Append-only tenant audit stream. UPDATE and DELETE are intentionally not granted.';
