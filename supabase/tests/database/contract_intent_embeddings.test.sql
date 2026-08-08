begin;

select plan(13);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  created_at,
  updated_at
)
values
  (
    '5c19d4c4-65be-4f42-bc2e-1d92df287603',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'intent-author@example.com',
    '',
    now(),
    now()
  ),
  (
    '98f0f74c-d14e-480e-830e-f1872f5af15e',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'other-author@example.com',
    '',
    now(),
    now()
  );

insert into public.organizations (id, slug, name, created_by)
values
  (
    'bd732174-66b5-47da-8557-969738c6ca6b',
    'intent-tenant-a',
    'Intent Tenant A',
    '5c19d4c4-65be-4f42-bc2e-1d92df287603'
  ),
  (
    'bb86b409-67ce-474b-946d-ef6948159621',
    'intent-tenant-b',
    'Intent Tenant B',
    '98f0f74c-d14e-480e-830e-f1872f5af15e'
  );

insert into public.organization_memberships (organization_id, user_id, role)
values
  (
    'bd732174-66b5-47da-8557-969738c6ca6b',
    '5c19d4c4-65be-4f42-bc2e-1d92df287603',
    'AUTHOR'
  ),
  (
    'bb86b409-67ce-474b-946d-ef6948159621',
    '98f0f74c-d14e-480e-830e-f1872f5af15e',
    'AUTHOR'
  );

insert into public.workspaces (
  organization_id,
  id,
  domain,
  name,
  document,
  created_by
)
values
  (
    'bd732174-66b5-47da-8557-969738c6ca6b',
    'intent-workspace-a',
    'test',
    'Intent Workspace A',
    '{}',
    '5c19d4c4-65be-4f42-bc2e-1d92df287603'
  ),
  (
    'bb86b409-67ce-474b-946d-ef6948159621',
    'intent-workspace-b',
    'test',
    'Intent Workspace B',
    '{}',
    '98f0f74c-d14e-480e-830e-f1872f5af15e'
  );

insert into public.contracts (
  organization_id,
  id,
  workspace_id,
  name,
  domain,
  draft,
  created_by,
  updated_by
)
values
  (
    'bd732174-66b5-47da-8557-969738c6ca6b',
    'intent-contract-a',
    'intent-workspace-a',
    'Intent Contract A',
    'test',
    '{}',
    '5c19d4c4-65be-4f42-bc2e-1d92df287603',
    '5c19d4c4-65be-4f42-bc2e-1d92df287603'
  ),
  (
    'bb86b409-67ce-474b-946d-ef6948159621',
    'intent-contract-b',
    'intent-workspace-b',
    'Intent Contract B',
    'test',
    '{}',
    '98f0f74c-d14e-480e-830e-f1872f5af15e',
    '98f0f74c-d14e-480e-830e-f1872f5af15e'
  );

insert into public.contract_releases (
  organization_id,
  contract_id,
  digest,
  version,
  notes,
  contract,
  published_by
)
values
  (
    'bd732174-66b5-47da-8557-969738c6ca6b',
    'intent-contract-a',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '1.0.0',
    'Intent release A',
    '{}',
    '5c19d4c4-65be-4f42-bc2e-1d92df287603'
  ),
  (
    'bb86b409-67ce-474b-946d-ef6948159621',
    'intent-contract-b',
    'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    '1.0.0',
    'Intent release B',
    '{}',
    '98f0f74c-d14e-480e-830e-f1872f5af15e'
  );

select is(
  (
    select count(*)::integer
    from pg_class
    where relname in ('contract_intent_indexes', 'contract_intent_documents')
      and relrowsecurity
  ),
  2,
  'RLS is enabled on both exposed intent tables'
);

select ok(
  not has_table_privilege('anon', 'public.contract_intent_indexes', 'SELECT'),
  'anonymous clients cannot read intent indexes'
);

select ok(
  not has_table_privilege('anon', 'public.contract_intent_documents', 'SELECT'),
  'anonymous clients cannot read intent documents'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '5c19d4c4-65be-4f42-bc2e-1d92df287603',
  true
);

select lives_ok(
  $$insert into public.contract_intent_indexes (
      organization_id,
      contract_id,
      release_digest,
      expected_document_count,
      created_by
    )
    values (
      'bd732174-66b5-47da-8557-969738c6ca6b',
      'intent-contract-a',
      'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      1,
      '5c19d4c4-65be-4f42-bc2e-1d92df287603'
    )$$,
  'an author can create a pending release-scoped intent index'
);

select lives_ok(
  $$insert into public.contract_intent_documents (
      organization_id,
      contract_id,
      release_digest,
      document_key,
      document_kind,
      operation_id,
      question_id,
      content
    )
    values (
      'bd732174-66b5-47da-8557-969738c6ca6b',
      'intent-contract-a',
      'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'question:intent-question-a',
      'QUESTION',
      'operation-a',
      'intent-question-a',
      'Which governed operation handles a paraphrased request?'
    )$$,
  'an author can create a pending intent document'
);

select is(
  (select count(*)::integer from public.contract_intent_documents),
  1,
  'an author sees only intent documents in their organization'
);

select throws_ok(
  $$insert into public.contract_intent_indexes (
      organization_id,
      contract_id,
      release_digest,
      expected_document_count,
      created_by
    )
    values (
      'bb86b409-67ce-474b-946d-ef6948159621',
      'intent-contract-b',
      'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      1,
      '5c19d4c4-65be-4f42-bc2e-1d92df287603'
    )$$,
  '42501',
  null,
  'an author cannot create an index in another organization'
);

select matches(
  (
    select content_hash
    from public.contract_intent_documents
    where document_key = 'question:intent-question-a'
  ),
  '^sha256:[0-9a-f]{64}$',
  'intent document content receives a deterministic SHA-256 digest'
);

select throws_ok(
  $$update public.contract_intent_documents
    set embedding_status = 'READY'
    where document_key = 'question:intent-question-a'$$,
  '42501',
  null,
  'application users cannot forge READY embeddings'
);

reset role;

update public.contract_intent_documents
set
  embedding = (
    '['
    || array_to_string(array_fill(1::real, array[1536]), ',')
    || ']'
  )::extensions.halfvec(1536),
  embedding_status = 'READY',
  embedding_attempt_count = 1,
  embedded_at = now()
where organization_id = 'bd732174-66b5-47da-8557-969738c6ca6b'
  and document_key = 'question:intent-question-a';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '5c19d4c4-65be-4f42-bc2e-1d92df287603',
  true
);

select is(
  (
    select status
    from public.contract_intent_indexes
    where organization_id = 'bd732174-66b5-47da-8557-969738c6ca6b'
      and contract_id = 'intent-contract-a'
  ),
  'READY',
  'the release index becomes READY when every expected document is embedded'
);

select matches(
  (
    select index_digest
    from public.contract_intent_indexes
    where organization_id = 'bd732174-66b5-47da-8557-969738c6ca6b'
      and contract_id = 'intent-contract-a'
  ),
  '^sha256:[0-9a-f]{64}$',
  'a READY index receives a deterministic SHA-256 digest'
);

select is(
  (
    select matched.operation_id
    from public.match_contract_intents(
      'bd732174-66b5-47da-8557-969738c6ca6b',
      'intent-contract-a',
      'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      (
        '['
        || array_to_string(array_fill(1::real, array[1536]), ',')
        || ']'
      )::extensions.halfvec(1536),
      0.99,
      5
    ) matched
    limit 1
  ),
  'operation-a',
  'the match RPC returns the governed operation for a similar query'
);

select is(
  (
    select count(*)::integer
    from public.match_contract_intents(
      'bb86b409-67ce-474b-946d-ef6948159621',
      'intent-contract-b',
      'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      (
        '['
        || array_to_string(array_fill(1::real, array[1536]), ',')
        || ']'
      )::extensions.halfvec(1536),
      0,
      5
    )
  ),
  0,
  'the match RPC cannot retrieve another organization intent index'
);

select * from finish();
rollback;
