-- SEC-029 (decision JC 2026-10-27): el limite de prestamos cuenta solo prestamos ACTIVOS.
-- Antes el trigger contaba todo prestamo no borrado, asi que uno saldado seguia ocupando
-- el tope (del plan y por cliente). Solo cambia el conteo; el trigger guard_loan_limit
-- sigue atado a loans y los codigos de error no cambian (el modal de la app los sigue mostrando).
-- Como el trigger es BEFORE INSERT en loans, el limite ya aplica a create_loan y a cualquier
-- otra via de creacion: no hace falta tocar create_loan.
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
    select count(*) into v_count from public.loans where business_id = new.business_id and deleted_at is null and status = 'active';
    if v_count >= v_max then raise exception 'PLAN_LIMIT_LOANS' using errcode = 'P0001'; end if;
  end if;
  if v_per_client is not null then
    select count(*) into v_client_loans from public.loans where client_id = new.client_id and deleted_at is null and status = 'active';
    if v_client_loans >= v_per_client then raise exception 'PLAN_LIMIT_ONE_LOAN_PER_CLIENT' using errcode = 'P0001'; end if;
  end if;
  return new;
end $function$;
