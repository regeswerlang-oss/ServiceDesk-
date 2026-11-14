-- SDHub 0002 — "interno" amarrado ao cadastro do Cockpit (14/11/2026)
--
-- Antes: totvs.is_interno() olhava so totvs.profiles.role = 'interno', e a Edge
-- Function cockpit-login gravava 'interno' para QUALQUER login do Cockpit (inclusive
-- perfis cliente/leitor). Inativar alguem no Cockpit nao cortava sessao aberta.
--
-- Agora:
--   1) is_interno() exige, alem do role, que o e-mail esteja ATIVO no
--      cockpit.usuarios_login com perfil interno (admin, gestor, comum,
--      consultoria, dev). Vale na hora para RLS de todo o schema totvs
--      (SDHub, DashboardIndex), mesmo com sessao aberta.
--   2) Trigger em cockpit.usuarios_login: ao inativar ou mudar para perfil nao
--      interno, rebaixa totvs.profiles.role de 'interno' para 'cliente' — as Edge
--      Functions (requireInterno le profiles.role) passam a recusar tambem.
--   Contas fora do Cockpit (ex.: smoketest) deixam de ser internas.

create or replace function totvs.perfil_interno(p text, adm boolean)
returns boolean language sql immutable as $$
  select coalesce(adm, false) or coalesce(p, '') in ('admin','gestor','comum','consultoria','dev')
$$;

create or replace function totvs.is_interno()
returns boolean language sql stable security definer
set search_path to totvs, auth, cockpit as $$
  select exists (
    select 1
      from totvs.profiles p
      join auth.users u on u.id = p.id
      join cockpit.usuarios_login ul on lower(ul.email) = lower(u.email)
     where p.id = auth.uid()
       and p.role = 'interno'
       and ul.ativo
       and totvs.perfil_interno(ul.perfil, ul.is_admin)
  );
$$;

create or replace function cockpit.sync_profile_interno()
returns trigger language plpgsql security definer
set search_path to cockpit, totvs, auth as $$
begin
  if (new.ativo is false) or not totvs.perfil_interno(new.perfil, new.is_admin) then
    update totvs.profiles p set role = 'cliente'
      from auth.users u
     where u.id = p.id and lower(u.email) = lower(new.email) and p.role = 'interno';
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_profile_interno on cockpit.usuarios_login;
create trigger trg_sync_profile_interno
  after insert or update of ativo, perfil, is_admin on cockpit.usuarios_login
  for each row execute function cockpit.sync_profile_interno();

-- Saneamento: quem hoje e 'interno' sem cadastro interno ativo no Cockpit.
update totvs.profiles p set role = 'cliente'
 where p.role = 'interno'
   and not exists (
     select 1 from auth.users u
       join cockpit.usuarios_login ul on lower(ul.email) = lower(u.email)
      where u.id = p.id and ul.ativo and totvs.perfil_interno(ul.perfil, ul.is_admin));
