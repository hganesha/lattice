begin;

select plan(14);

select ok(
  not has_schema_privilege('anon', 'private', 'USAGE'),
  'anonymous clients cannot access the private schema'
);

select ok(
  not has_table_privilege('authenticated', 'private.signup_email_allowlist', 'SELECT'),
  'application users cannot read the signup allowlist'
);

select ok(
  has_function_privilege('supabase_auth_admin', 'private.hook_restrict_signup_to_allowlist(jsonb)', 'EXECUTE'),
  'Supabase Auth can execute the admission hook'
);

select ok(
  not has_function_privilege('anon', 'private.hook_restrict_signup_to_allowlist(jsonb)', 'EXECUTE'),
  'anonymous clients cannot execute the admission hook'
);

select ok(
  not has_function_privilege('anon', 'private.allow_signup_email(text,text,timestamptz)', 'EXECUTE'),
  'anonymous clients cannot execute the administrative allowlist helper'
);

select is(
  (private.hook_restrict_signup_to_allowlist('{"user":{"email":"nobody@example.com"}}'::jsonb) -> 'error' ->> 'http_code')::integer,
  403,
  'an empty allowlist denies new identities'
);

insert into private.signup_email_allowlist (entry_type, entry_value, note)
values ('EMAIL', 'approved@example.com', 'Exact invitation test');

select is(
  private.hook_restrict_signup_to_allowlist('{"user":{"email":"Approved@Example.com"}}'::jsonb),
  '{}'::jsonb,
  'an exact email entry is case-insensitive and permits creation'
);

select is(
  (private.hook_restrict_signup_to_allowlist('{"user":{"email":"other@example.com"}}'::jsonb) -> 'error' ->> 'http_code')::integer,
  403,
  'an exact email entry does not allow the entire domain'
);

insert into private.signup_email_allowlist (entry_type, entry_value, note)
values ('DOMAIN', 'trusted.example', 'Approved workforce domain');

select is(
  private.hook_restrict_signup_to_allowlist('{"user":{"email":"person@trusted.example"}}'::jsonb),
  '{}'::jsonb,
  'an enabled domain entry permits identities at that exact domain'
);

insert into private.signup_email_allowlist (entry_type, entry_value, expires_at)
values ('EMAIL', 'expired@example.net', now() - interval '1 minute');

select is(
  (private.hook_restrict_signup_to_allowlist('{"user":{"email":"expired@example.net"}}'::jsonb) -> 'error' ->> 'http_code')::integer,
  403,
  'an expired entry denies identity creation'
);

select lives_ok(
  $$insert into private.signup_email_allowlist (entry_type, entry_value, note)
    values (' email ', ' Mixed.Case@Example.ORG ', ' Normalized by trigger ')$$,
  'table editor style input is normalized before constraints run'
);

select is(
  (select entry_type || ':' || entry_value
   from private.signup_email_allowlist
   where entry_value = 'mixed.case@example.org'),
  'EMAIL:mixed.case@example.org',
  'the trigger stores a canonical type and email'
);

select lives_ok(
  $$select private.allow_signup_email(' Helper@Example.ORG ', 'Added with helper')$$,
  'the administrative helper accepts unnormalized email input'
);

select is(
  private.hook_restrict_signup_to_allowlist('{"user":{"email":"helper@example.org"}}'::jsonb),
  '{}'::jsonb,
  'an address added through the helper passes admission'
);

select * from finish();
rollback;
