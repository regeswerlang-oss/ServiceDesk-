-- SDHub 0001 — Recorte por Gestor de Demandas + contexto do "Ver como" (14/11/2026)
--
-- Conceito (o mesmo do Cockpit Unico): o usuario com perfil 'gestor' em
-- cockpit.usuarios_login ve SO os tickets dos clientes da carteira dele
-- (cockpit.carteira_demandas, um gestor por cliente). Os demais perfis internos
-- continuam vendo tudo, como antes.
--
-- O recorte e aplicado no BANCO (RLS de totvs.movidesk_tickets): o SDHub e um
-- site estatico com chave publica, entao filtro so na tela nao protegeria nada.
--
-- Liga a sessao Supabase ao login do Cockpit pelo e-mail: a Edge Function
-- cockpit-login cria o usuario-espelho em auth.users com o MESMO e-mail do
-- cockpit.usuarios_login.

-- E-mail (minusculo) do usuario da sessao.
create or replace function totvs.cockpit_email()
returns text language sql stable security definer
set search_path to totvs, auth as $$
  select lower(u.email) from auth.users u where u.id = auth.uid()
$$;

-- Recorte de um usuario: null = todos os clientes; array = so esses.
-- Gestor sem carteira = array vazio (nao ve nada — fail-closed).
-- Usuario fora do cockpit.usuarios_login = null (comportamento antigo).
create or replace function totvs.sd_recorte_de(p_email text)
returns text[] language sql stable security definer
set search_path to cockpit, totvs as $$
  select case when ul.perfil = 'gestor' then
           coalesce((select array_agg(cd.customer order by cd.customer)
                       from cockpit.carteira_demandas cd
                      where lower(cd.email) = lower(ul.email)), '{}'::text[])
         else null end
    from cockpit.usuarios_login ul
   where lower(ul.email) = lower(p_email)
$$;

create or replace function totvs.sd_recorte()
returns text[] language sql stable security definer
set search_path to totvs as $$
  select totvs.sd_recorte_de(totvs.cockpit_email())
$$;

-- RLS: interno ve tudo, MENOS o gestor (so a carteira); cliente segue pelo
-- customer_code do profile. (select ...) vira initplan: avaliado 1x por consulta.
drop policy if exists movidesk_select on totvs.movidesk_tickets;
create policy movidesk_select on totvs.movidesk_tickets for select to authenticated
using (
  (totvs.is_interno() and ((select totvs.sd_recorte()) is null
                           or array[customer_code] <@ (select totvs.sd_recorte())))
  or customer_code = totvs.current_customer_code()
);

drop policy if exists movidesk_write on totvs.movidesk_tickets;
create policy movidesk_write on totvs.movidesk_tickets for all to authenticated
using (
  totvs.is_interno() and ((select totvs.sd_recorte()) is null
                          or array[customer_code] <@ (select totvs.sd_recorte()))
)
with check (
  totvs.is_interno() and ((select totvs.sd_recorte()) is null
                          or array[customer_code] <@ (select totvs.sd_recorte()))
);

-- Contexto da tela: quem sou, meu recorte e, para ADMIN, a lista do combo
-- "Ver como" e o recorte do usuario escolhido. Nao-admin que passar
-- p_ver_como recebe ver_como = null (ignorado).
create or replace function totvs.sd_contexto(p_ver_como text default null)
returns jsonb language plpgsql stable security definer
set search_path to cockpit, totvs as $$
declare
  v_email text := totvs.cockpit_email();
  v_me    cockpit.usuarios_login%rowtype;
  v_alvo  cockpit.usuarios_login%rowtype;
  v_admin boolean;
  v_res   jsonb;
begin
  select * into v_me from cockpit.usuarios_login where lower(email) = v_email;
  v_admin := coalesce(v_me.perfil = 'admin' or v_me.is_admin, false);

  v_res := jsonb_build_object(
    'email',   v_email,
    'nome',    coalesce(v_me.nome, v_email),
    'perfil',  coalesce(v_me.perfil, 'interno'),
    'admin',   v_admin,
    'recorte', to_jsonb(totvs.sd_recorte_de(v_email)),
    'ver_como', null,
    'opcoes',  '[]'::jsonb
  );

  if v_admin then
    v_res := v_res || jsonb_build_object('opcoes', coalesce((
      select jsonb_agg(jsonb_build_object('email', u.email, 'nome', coalesce(u.nome, u.email), 'perfil', u.perfil)
                       order by (u.perfil <> 'gestor'), u.nome)
        from cockpit.usuarios_login u
       where u.ativo and lower(u.email) <> v_email), '[]'::jsonb));

    if coalesce(trim(p_ver_como), '') <> '' then
      select * into v_alvo from cockpit.usuarios_login
       where lower(email) = lower(trim(p_ver_como)) and ativo;
      if found then
        v_res := v_res || jsonb_build_object('ver_como', jsonb_build_object(
          'email',   v_alvo.email,
          'nome',    coalesce(v_alvo.nome, v_alvo.email),
          'perfil',  v_alvo.perfil,
          'recorte', to_jsonb(totvs.sd_recorte_de(v_alvo.email))));
      end if;
    end if;
  end if;
  return v_res;
end $$;

revoke all on function totvs.sd_contexto(text) from public, anon;
grant execute on function totvs.sd_contexto(text) to authenticated;
revoke all on function totvs.sd_recorte_de(text) from public, anon, authenticated;
grant execute on function totvs.sd_recorte() to authenticated;
grant execute on function totvs.cockpit_email() to authenticated;
