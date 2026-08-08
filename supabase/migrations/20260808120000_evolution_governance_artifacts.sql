-- Governed artifacts for the operate and prove loops.
--
-- `governed_artifacts` was defined for the five kinds that existed when it was written, with a
-- CHECK constraint enumerating them and `contract_id` NOT NULL. The disposition trail, evaluation
-- runs, case sets, drift events, negative decisions, attestations, principals, delegation grants
-- and emergency authorizations cannot be stored under either rule, so those ledgers are still
-- file-backed — which on a serverless deployment means they live for one invocation and are then
-- discarded. This widens the table so they can move to Postgres.
--
-- Two changes, both additive to existing rows:
--
--   1. The kind CHECK gains the new artifact kinds. Chains are already keyed per organization and
--      per kind (`governed_artifacts_chain_idx`), so each new kind starts its own chain at
--      sequence 0 and `append_governed_artifact` needs no change at all.
--
--   2. `contract_id` becomes nullable, because not every governed artifact belongs to a contract.
--      A principal, a delegation grant and a workspace-scoped case set or drift event are scoped
--      to the organization or the workspace. A replacement CHECK keeps the kinds that *are*
--      contract-scoped honest, so nullability cannot be used to smuggle an unscoped disposition
--      into the ledger.
--
-- The foreign key on (organization_id, contract_id) is MATCH SIMPLE, so a NULL contract_id
-- satisfies it without further change.

-- Dropped by lookup rather than by name: the original constraint is inline, so its name is
-- generated, and a migration that guesses wrong fails against a real database.
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'governed_artifacts'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%ASSURANCE_RUN%';

  if constraint_name is not null then
    execute format('alter table public.governed_artifacts drop constraint %I', constraint_name);
  end if;
end;
$$;

alter table public.governed_artifacts
  add constraint governed_artifacts_kind_check check (kind in (
    -- Already in use.
    'ASSURANCE_RUN',
    'REVIEW',
    'RUNTIME_APPROVAL',
    'EXECUTION_RECEIPT',
    'RELEASE_EVENT',
    -- The operate loop: every compile persists, dry run and authorized alike.
    'DISPOSITION',
    'ATTESTATION',
    -- The prove loop.
    'CASE_SET',
    'EVAL_RUN',
    -- Governance depth.
    'NEGATIVE_DECISION',
    'DRIFT_EVENT',
    -- Identity and break-glass.
    'PRINCIPAL',
    'DELEGATION_GRANT',
    'EMERGENCY_AUTHORIZATION'
  ));

alter table public.governed_artifacts
  alter column contract_id drop not null;

-- Which kinds must name a contract. An attestation is deliberately absent: it covers whatever
-- subject it was minted for, and that subject is not always a contract.
alter table public.governed_artifacts
  add constraint governed_artifacts_contract_scope_check check (
    contract_id is not null
    or kind in (
      'ATTESTATION',
      'CASE_SET',
      'NEGATIVE_DECISION',
      'DRIFT_EVENT',
      'PRINCIPAL',
      'DELEGATION_GRANT'
    )
  );

-- Workspace-scoped reads — the drift board, the identity directory, the cross-contract review
-- inbox — filter on a workspace rather than a contract. The id lives in the document, so this
-- indexes the expression instead of adding a column, which would change the signature of
-- `append_governed_artifact` and force every existing caller to be rewritten.
create index if not exists governed_artifacts_workspace_idx
  on public.governed_artifacts (organization_id, kind, (document ->> 'workspaceId'), created_at desc)
  where document ? 'workspaceId';

-- A disposition names the principal it was issued to, and the trail is filtered by principal on
-- every visit to the surface.
create index if not exists governed_artifacts_principal_idx
  on public.governed_artifacts (organization_id, (document ->> 'principalId'), created_at desc)
  where kind = 'DISPOSITION';

-- An attestation is always looked up by the artifact it covers.
create index if not exists governed_artifacts_attestation_subject_idx
  on public.governed_artifacts (organization_id, (document ->> 'subjectId'))
  where kind = 'ATTESTATION';

comment on constraint governed_artifacts_contract_scope_check on public.governed_artifacts is
  'Contract-scoped kinds must name a contract; organization- and workspace-scoped kinds may not.';

-- Retention note. The file-backed trail moves overflow into a separate archive file once it
-- passes 90 days or 5000 records. There is no equivalent move here and there should not be one:
-- relocating a row would break the hash chain it belongs to. Retention against this table is a
-- read-side concern — filter by `created_at`, and expire with a scheduled job that records what
-- it removed — rather than a second table.
