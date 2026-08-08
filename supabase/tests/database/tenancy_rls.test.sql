begin;

select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('1351f96b-8103-4851-b7c2-a9e4f60dde1b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'author-a@example.com', '', now(), now()),
  ('2daf162a-92b4-4353-8f4e-36af0be453e9', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer-b@example.com', '', now(), now());

insert into public.organizations (id, slug, name, created_by)
values
  ('78dc4be7-cd24-43ad-97f8-83cddfbf43a0', 'tenant-a', 'Tenant A', '1351f96b-8103-4851-b7c2-a9e4f60dde1b'),
  ('82f3ec9f-a5e5-492c-aaf6-fe090d1fd16c', 'tenant-b', 'Tenant B', '2daf162a-92b4-4353-8f4e-36af0be453e9');

insert into public.organization_memberships (organization_id, user_id, role)
values
  ('78dc4be7-cd24-43ad-97f8-83cddfbf43a0', '1351f96b-8103-4851-b7c2-a9e4f60dde1b', 'AUTHOR'),
  ('82f3ec9f-a5e5-492c-aaf6-fe090d1fd16c', '2daf162a-92b4-4353-8f4e-36af0be453e9', 'VIEWER');

select is(
  (select count(*)::integer from pg_class where relname in ('organizations', 'organization_memberships', 'workspaces', 'contracts', 'contract_releases', 'governed_artifacts', 'connector_health', 'audit_events') and relrowsecurity),
  8,
  'RLS is enabled on every exposed tenant table'
);

select ok(
  not has_table_privilege('anon', 'public.organizations', 'SELECT'),
  'anonymous clients cannot read organizations'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '1351f96b-8103-4851-b7c2-a9e4f60dde1b', true);

select is(
  (select count(*)::integer from public.organizations),
  1,
  'a user sees only their own organization'
);

select ok(
  (select public.is_organization_member('78dc4be7-cd24-43ad-97f8-83cddfbf43a0')),
  'membership is resolved for the active organization'
);

select ok(
  not (select public.is_organization_member('82f3ec9f-a5e5-492c-aaf6-fe090d1fd16c')),
  'membership does not cross organization boundaries'
);

select lives_ok(
  $$select public.create_organization('Tenant C', 'tenant-c')$$,
  'organization onboarding completes atomically'
);

select is(
  (select membership.role::text
   from public.organization_memberships membership
   join public.organizations organization on organization.id = membership.organization_id
   where organization.slug = 'tenant-c'),
  'OWNER',
  'organization onboarding assigns its creator the owner role'
);

select lives_ok(
  $$insert into public.workspaces (organization_id, id, domain, name, document, created_by)
    values ('78dc4be7-cd24-43ad-97f8-83cddfbf43a0', 'workspace-a', 'test', 'Workspace A', '{}', '1351f96b-8103-4851-b7c2-a9e4f60dde1b')$$,
  'an author can create a workspace in their organization'
);

select throws_ok(
  $$insert into public.workspaces (organization_id, id, domain, name, document, created_by)
    values ('82f3ec9f-a5e5-492c-aaf6-fe090d1fd16c', 'workspace-b-from-a', 'test', 'Workspace B', '{}', '1351f96b-8103-4851-b7c2-a9e4f60dde1b')$$,
  '42501',
  null,
  'an author cannot create a workspace in another organization'
);

select throws_ok(
  $$update public.organization_memberships set role = 'OWNER'
    where organization_id = '78dc4be7-cd24-43ad-97f8-83cddfbf43a0'$$,
  '42501',
  null,
  'authenticated users cannot promote their own membership'
);

select * from finish();
rollback;
