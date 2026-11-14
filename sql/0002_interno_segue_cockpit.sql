-- SDHub 0002 — "interno" segue o cadastro do Cockpit (14/11/2026)
--
-- Antes: is_interno() olhava so totvs.profiles.role = 'interno'. Inativar ou
-- rebaixar alguem no Cockpit nao cortava o acesso de quem ja tinha sessao.
-- Agora: alem do profile, se o e-mail da sessao existe em cockpit.usuarios_login,
-- ele precisa estar ATIVO e com perfil interno (nao 'cliente' nem 'leitor').
-- Contas que nao existem no Cockpit seguem a regra antiga (so o profile).
--
-- Vale para TODAS as politicas do schema totvs que usam is_interno()
-- (SDHub, DashboardIndex etc.). Em 14/11/2026 nenhum usuario ativo perdeu acesso:
-- nao havia profile 'interno' de usuario inativo/cliente/leitor no Cockpit.
create or replace function totvs.is_interno()
returns boolean language sql stable security definer
set search_path to totvs, auth, cockpit as $$
  select exists (select 1 from totvs.profiles p where p.id = auth.uid() and p.role = 'interno')
     and not exists (
       select 1
         from auth.users u
         join cockpit.usuarios_login ul on lower(ul.email) = lower(u.email)
        where u.id = auth.uid()
          and (ul.ativo = false or ul.perfil in ('cliente', 'leitor'))
     )
$$;
