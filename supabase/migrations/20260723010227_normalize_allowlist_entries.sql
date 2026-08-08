alter table private.signup_email_allowlist
  alter column entry_type set default 'EMAIL';

create function private.normalize_signup_email_allowlist_entry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.entry_type := upper(trim(new.entry_type));
  new.entry_value := lower(trim(new.entry_value));
  new.note := nullif(trim(new.note), '');
  return new;
end;
$$;

revoke all on function private.normalize_signup_email_allowlist_entry() from public;
revoke all on function private.normalize_signup_email_allowlist_entry() from anon;
revoke all on function private.normalize_signup_email_allowlist_entry() from authenticated;

create trigger normalize_signup_email_allowlist_entry
before insert or update on private.signup_email_allowlist
for each row
execute function private.normalize_signup_email_allowlist_entry();

create function private.allow_signup_email(
  candidate_email text,
  reason text default null,
  valid_until timestamptz default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allowlist_id bigint;
begin
  insert into private.signup_email_allowlist (
    entry_type,
    entry_value,
    note,
    enabled,
    expires_at
  ) values (
    'EMAIL',
    candidate_email,
    reason,
    true,
    valid_until
  )
  on conflict (entry_type, entry_value) do update
  set note = excluded.note,
      enabled = true,
      expires_at = excluded.expires_at
  returning id into allowlist_id;

  return allowlist_id;
end;
$$;

comment on function private.allow_signup_email(text, text, timestamptz) is
  'Administrative helper that normalizes and enables one exact signup email.';

revoke all on function private.allow_signup_email(text, text, timestamptz) from public;
revoke all on function private.allow_signup_email(text, text, timestamptz) from anon;
revoke all on function private.allow_signup_email(text, text, timestamptz) from authenticated;
revoke all on function private.allow_signup_email(text, text, timestamptz) from service_role;
