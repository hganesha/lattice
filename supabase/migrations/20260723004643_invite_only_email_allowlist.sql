create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to supabase_auth_admin;

create table private.signup_email_allowlist (
  id bigint generated always as identity primary key,
  entry_type text not null check (entry_type in ('EMAIL', 'DOMAIN')),
  entry_value text not null,
  note text,
  enabled boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (entry_type, entry_value),
  check (entry_value = lower(trim(entry_value))),
  check (entry_value !~ '[[:space:]]'),
  check (
    (entry_type = 'EMAIL' and entry_value ~ '^[^@]+@[^@]+$')
    or (entry_type = 'DOMAIN' and entry_value ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$')
  )
);

comment on table private.signup_email_allowlist is
  'Server-managed admission list for new Supabase Auth identities. Empty means deny all new users.';
comment on column private.signup_email_allowlist.entry_type is
  'EMAIL allows one exact normalized address; DOMAIN allows every address at one exact domain.';

alter table private.signup_email_allowlist enable row level security;

create policy "Supabase Auth can evaluate signup admission"
on private.signup_email_allowlist for select
to supabase_auth_admin
using (true);

revoke all on table private.signup_email_allowlist from public;
revoke all on table private.signup_email_allowlist from anon;
revoke all on table private.signup_email_allowlist from authenticated;
grant select on table private.signup_email_allowlist to supabase_auth_admin;

create function private.hook_restrict_signup_to_allowlist(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  candidate_email text := lower(trim(coalesce(event -> 'user' ->> 'email', '')));
  candidate_domain text;
begin
  candidate_domain := split_part(candidate_email, '@', 2);

  if candidate_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'This email address is not authorized for Lattice.'
      )
    );
  end if;

  if exists (
    select 1
    from private.signup_email_allowlist allowlist
    where allowlist.enabled
      and (allowlist.expires_at is null or allowlist.expires_at > now())
      and (
        (allowlist.entry_type = 'EMAIL' and allowlist.entry_value = candidate_email)
        or (allowlist.entry_type = 'DOMAIN' and allowlist.entry_value = candidate_domain)
      )
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This email address is not authorized for Lattice.'
    )
  );
end;
$$;

revoke all on function private.hook_restrict_signup_to_allowlist(jsonb) from public;
revoke all on function private.hook_restrict_signup_to_allowlist(jsonb) from anon;
revoke all on function private.hook_restrict_signup_to_allowlist(jsonb) from authenticated;
grant execute on function private.hook_restrict_signup_to_allowlist(jsonb) to supabase_auth_admin;
