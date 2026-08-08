begin;

select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('4b8e5f2a-9d31-4c77-b0a6-1f2e3d4c5b6a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'steward@example.com', '', now(), now());

insert into public.organizations (id, slug, name, created_by)
values ('9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f', 'tenant-evolution', 'Tenant Evolution', '4b8e5f2a-9d31-4c77-b0a6-1f2e3d4c5b6a');

insert into public.organization_memberships (organization_id, user_id, role)
values ('9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f', '4b8e5f2a-9d31-4c77-b0a6-1f2e3d4c5b6a', 'AUTHOR');

insert into public.workspaces (organization_id, id, domain, name, document, created_by)
values ('9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f', 'workspace-e', 'financial_services', 'Workspace E', '{}'::jsonb, '4b8e5f2a-9d31-4c77-b0a6-1f2e3d4c5b6a');

insert into public.contracts (organization_id, id, workspace_id, name, domain, draft, runtime_status, created_by, updated_by)
values ('9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f', 'contract-e', 'workspace-e', 'Contract E', 'financial_services', '{}'::jsonb, 'NO_RELEASE', '4b8e5f2a-9d31-4c77-b0a6-1f2e3d4c5b6a', '4b8e5f2a-9d31-4c77-b0a6-1f2e3d4c5b6a');

set local role authenticated;
select set_config('request.jwt.claim.sub', '4b8e5f2a-9d31-4c77-b0a6-1f2e3d4c5b6a', true);

-- Every compile persists, so a disposition has to be a storable artifact kind.
select is(
  (select chain_sequence from public.append_governed_artifact(
    '9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f', 'contract-e', 'DISPOSITION', 'disp-1', 'sha256:d1',
    '{"id":"disp-1","principalId":"principal-1","workspaceId":"workspace-e"}'::jsonb)),
  0::bigint,
  'a disposition opens its own chain'
);

-- Each kind is its own ledger, so an evaluation run does not continue the disposition chain.
select is(
  (select chain_sequence from public.append_governed_artifact(
    '9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f', 'contract-e', 'EVAL_RUN', 'run-e1', 'sha256:e1', '{"id":"run-e1"}'::jsonb)),
  0::bigint,
  'an evaluation run keeps a chain separate from dispositions'
);

-- A principal belongs to the organization, not to any one contract.
select is(
  (select contract_id from public.append_governed_artifact(
    '9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f', null, 'PRINCIPAL', 'principal-1', 'sha256:p1',
    '{"id":"principal-1","workspaceId":"workspace-e"}'::jsonb)),
  null,
  'a principal is stored without a contract'
);

-- Nullability is for artifacts that genuinely have no contract, not a way to drop the scope from
-- ones that do.
select throws_ok(
  $$select public.append_governed_artifact(
    '9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f', null, 'DISPOSITION', 'disp-unscoped', 'sha256:d2', '{"id":"disp-unscoped"}'::jsonb)$$,
  '23514',
  null,
  'a disposition without a contract is refused'
);

select throws_ok(
  $$select public.append_governed_artifact(
    '9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f', 'contract-e', 'NOT_A_KIND', 'bogus-1', 'sha256:x', '{}'::jsonb)$$,
  '23514',
  null,
  'an unknown artifact kind is still refused'
);

-- The workspace index has to be usable by the surfaces that filter on it.
select is(
  (select count(*)::int from public.governed_artifacts
   where organization_id = '9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f'
     and document ->> 'workspaceId' = 'workspace-e'),
  2,
  'workspace-scoped artifacts are findable by workspace'
);

select * from finish();

rollback;
