begin;

select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('1351f96b-8103-4851-b7c2-a9e4f60dde1b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'author-a@example.com', '', now(), now()),
  ('2daf162a-92b4-4353-8f4e-36af0be453e9', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@example.com', '', now(), now());

insert into public.organizations (id, slug, name, created_by)
values ('78dc4be7-cd24-43ad-97f8-83cddfbf43a0', 'tenant-a', 'Tenant A', '1351f96b-8103-4851-b7c2-a9e4f60dde1b');

insert into public.organization_memberships (organization_id, user_id, role)
values ('78dc4be7-cd24-43ad-97f8-83cddfbf43a0', '1351f96b-8103-4851-b7c2-a9e4f60dde1b', 'AUTHOR');

insert into public.workspaces (organization_id, id, domain, name, document, created_by)
values ('78dc4be7-cd24-43ad-97f8-83cddfbf43a0', 'workspace-a', 'financial_services', 'Workspace A', '{}'::jsonb, '1351f96b-8103-4851-b7c2-a9e4f60dde1b');

insert into public.contracts (organization_id, id, workspace_id, name, domain, draft, runtime_status, created_by, updated_by)
values ('78dc4be7-cd24-43ad-97f8-83cddfbf43a0', 'contract-a', 'workspace-a', 'Contract A', 'financial_services', '{}'::jsonb, 'NO_RELEASE', '1351f96b-8103-4851-b7c2-a9e4f60dde1b', '1351f96b-8103-4851-b7c2-a9e4f60dde1b');

set local role authenticated;
select set_config('request.jwt.claim.sub', '1351f96b-8103-4851-b7c2-a9e4f60dde1b', true);

-- The first artifact of a kind starts the chain at genesis rather than at an arbitrary point.
select is(
  (select chain_sequence from public.append_governed_artifact(
    '78dc4be7-cd24-43ad-97f8-83cddfbf43a0', 'contract-a', 'ASSURANCE_RUN', 'run-1', 'sha256:aaa', '{"id":"run-1"}'::jsonb)),
  0::bigint,
  'the first artifact of a kind opens the chain at sequence 0'
);

select is(
  (select previous_digest from public.governed_artifacts where id = 'run-1'),
  'sha256:genesis',
  'the opening link points at genesis'
);

-- The digest must match linkArtifact() in apps/api/src/hashChain.ts exactly, or artifacts written
-- by Postgres will not verify in the API.
select is(
  (select chain_digest from public.governed_artifacts where id = 'run-1'),
  'sha256:' || encode(extensions.digest('sha256:genesis' || ' ' || 'sha256:aaa' || ' ' || '0', 'sha256'), 'hex'),
  'the chain digest is computed the way the API computes it'
);

select is(
  (select chain_sequence from public.append_governed_artifact(
    '78dc4be7-cd24-43ad-97f8-83cddfbf43a0', 'contract-a', 'ASSURANCE_RUN', 'run-2', 'sha256:bbb', '{"id":"run-2"}'::jsonb)),
  1::bigint,
  'the next artifact continues the chain'
);

select is(
  (select previous_digest from public.governed_artifacts where id = 'run-2'),
  (select chain_digest from public.governed_artifacts where id = 'run-1'),
  'each link records its predecessor, so a deletion breaks verification'
);

-- Chains are per kind: a review is a separate ledger from an assurance run.
select is(
  (select chain_sequence from public.append_governed_artifact(
    '78dc4be7-cd24-43ad-97f8-83cddfbf43a0', 'contract-a', 'REVIEW', 'review-1', 'sha256:ccc', '{"id":"review-1"}'::jsonb)),
  0::bigint,
  'a different kind keeps its own chain'
);

-- A forked sequence is the failure the unique index exists to prevent. Writing one directly is
-- what a concurrent append would have produced before the constraint existed.
select throws_ok(
  $$insert into public.governed_artifacts
      (organization_id, id, contract_id, kind, artifact_digest, document, created_by, chain_sequence, previous_digest, chain_digest)
    values
      ('78dc4be7-cd24-43ad-97f8-83cddfbf43a0', 'run-forked', 'contract-a', 'ASSURANCE_RUN', 'sha256:ddd',
       '{}'::jsonb, '1351f96b-8103-4851-b7c2-a9e4f60dde1b', 1, 'sha256:whatever', 'sha256:whatever')$$,
  '23505',
  null,
  'two artifacts cannot share a sequence, so concurrent appends cannot fork the chain'
);

-- Append-only: the ledger has no update policy, so a decision has to be a new artifact.
select is(
  (select count(*)::integer from pg_policies
    where tablename = 'governed_artifacts' and cmd in ('UPDATE', 'DELETE')),
  0,
  'the ledger stays append-only: no update or delete policy exists'
);

-- Membership is re-checked inside the function; security definer must not become a way around it.
select set_config('request.jwt.claim.sub', '2daf162a-92b4-4353-8f4e-36af0be453e9', true);
select throws_ok(
  $$select public.append_governed_artifact(
      '78dc4be7-cd24-43ad-97f8-83cddfbf43a0', 'contract-a', 'ASSURANCE_RUN', 'run-3', 'sha256:eee', '{}'::jsonb)$$,
  '42501',
  null,
  'a non-member cannot append through the definer function'
);

select * from finish();

rollback;
