-- Créditos por cliente como NÚMERO por plan (antes: interruptor 1 o ilimitado).
-- Orden: correr este SQL en Supabase (proyecto capitalia) ANTES de desplegar el panel
-- nuevo, porque el panel manda el parámetro nuevo. La función vieja de guardado se
-- reemplaza por una que lo acepta; las llamadas viejas (6 parámetros) siguen
-- funcionando porque el parámetro nuevo tiene default -1 = "conservar el actual".
-- El trigger conserva el conteo de antes: préstamos NO borrados del cliente
-- (sin filtro de estado), solo cambia el tope de 1/ilimitado al número del plan.

-- 1. Columna nueva (null = ilimitado, igual que los demás límites).
 alter table public.plan_limits add column if not exists max_loans_per_client integer;

-- 2. Valores iniciales desde el interruptor actual: 1 si estaba activado, ilimitado si no.
--    (Solo rellena los que aún están vacíos, así que se puede correr dos veces.)
update public.plan_limits
set max_loans_per_client = case when one_loan_per_client then 1 else null end
where max_loans_per_client is null;

-- 3. Trigger actualizado: usa el número del plan en vez del interruptor.
--    Misma firma que el anterior, así que el trigger guard_loan_limit sigue funcionando
--    sin tocarlo. El código de error no cambia: el modal de la app lo sigue mostrando.
create or replace function private.guard_loan_limit()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_plan text; v_max int; v_per_client int; v_count int; v_client_loans int;
begin
  v_plan := private.business_plan(new.business_id);
  select max_loans, max_loans_per_client into v_max, v_per_client from public.plan_limits where plan = v_plan;
  if v_max is not null then
    select count(*) into v_count from public.loans where business_id = new.business_id and deleted_at is null;
    if v_count >= v_max then raise exception 'PLAN_LIMIT_LOANS' using errcode = 'P0001'; end if;
  end if;
  if v_per_client is not null then
    select count(*) into v_client_loans from public.loans where client_id = new.client_id and deleted_at is null;
    if v_client_loans >= v_per_client then raise exception 'PLAN_LIMIT_ONE_LOAN_PER_CLIENT' using errcode = 'P0001'; end if;
  end if;
  return new;
end $function$;

-- 4. Guardado del SaaS: acepta el número nuevo.
drop function if exists public.set_plan_limit(text, text, integer, integer, integer, boolean);
create function public.set_plan_limit(p_plan text, p_price_label text, p_max_clients integer, p_max_loans integer, p_max_collaborators integer, p_one_loan_per_client boolean, p_max_loans_per_client integer default -1)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not (select public.is_platform_admin()) then
    raise exception 'Solo un administrador de la plataforma puede cambiar esto' using errcode = '42501';
  end if;
  if p_plan not in ('basic','pro','business') then raise exception 'Plan inválido'; end if;
  if p_max_clients is not null and p_max_clients < 0 then raise exception 'El límite de clientes no puede ser negativo'; end if;
  if p_max_loans is not null and p_max_loans < 0 then raise exception 'El límite de préstamos no puede ser negativo'; end if;
  if p_max_collaborators is not null and p_max_collaborators < 0 then raise exception 'El límite de colaboradores no puede ser negativo'; end if;
  if p_max_loans_per_client is not null and p_max_loans_per_client < -1 then raise exception 'El límite de créditos por cliente no puede ser negativo'; end if;
  update public.plan_limits set
    price_label = p_price_label, max_clients = p_max_clients, max_loans = p_max_loans,
    max_collaborators = p_max_collaborators, one_loan_per_client = p_one_loan_per_client,
    max_loans_per_client = case when p_max_loans_per_client = -1 then max_loans_per_client else p_max_loans_per_client end
  where plan = p_plan;
end $function$;

-- Verificación después de correrlo:
-- select plan, max_loans_per_client, one_loan_per_client from plan_limits order by plan;
-- Esperado: basic 1, pro null (ilimitado), business null (ilimitado, tras tu UPDATE anterior).
