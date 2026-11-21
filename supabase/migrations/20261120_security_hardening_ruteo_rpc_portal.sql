-- Endurecimiento integral de funciones RPC (SECURITY DEFINER), aislamiento multi-negocio en ruteo y Portal del Cliente.
-- Corrige:
-- 1) Cross-Tenant IDOR en public.ruteo_resumen(uuid): exige business_id = private.current_business_id().
-- 2) Sobrescritura sin control en public.set_close_password(text): impide pisar una clave ya configurada.
-- 3) Permisos excesivos a 'anon' en funciones internas (open_ruteo, ruteo_resumen, set_close_password, verify_close_password, set_plan_limit).
-- 4) Blindaje exclusivo a 'service_role' para funciones de backend (wipe_business_data, resolve_api_key, check_api_rate_limit, generate_portal_unlock_code, nextex_business_summary).
-- 5) Filtro deleted_at IS NULL en portal_get_summary, portal_get_loans y portal_get_loan_detail.
-- 6) PRNG criptográfico (gen_random_bytes) y protección contra colisión multi-negocio / enumeración en generate_portal_unlock_code y confirm_portal_unlock.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Corregir ruteo_resumen para exigir pertenencia al mismo negocio
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ruteo_resumen(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_biz uuid := private.current_business_id();
  v_s record;
  v_collected_cash numeric := 0;
  v_collected_transfer numeric := 0;
  v_collected_other numeric := 0;
  v_off_cash numeric := 0;
  v_off_transfer numeric := 0;
  v_off_other numeric := 0;
  v_lent numeric := 0;
  v_expenses numeric := 0;
  v_collected_clients integer := 0;
  v_collected_clients_route integer := 0;
  v_collected_clients_off integer := 0;
  v_expected numeric := 0;
begin
  if v_biz is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select * into v_s
    from public.cash_sessions
   where id = p_session_id
     and business_id = v_biz;

  if not found then
    raise exception 'Sesión no encontrada';
  end if;

  if v_s.collector_id <> (select auth.uid())
       and not (select private.is_owner())
       and not (select private.has_permission('cash_sessions.view_all')) then
    raise exception 'No puedes ver sesiones de otros cobradores' using errcode = '42501';
  end if;

  select coalesce(sum(p.total_amount), 0) into v_collected_cash
    from public.payments p
   where p.business_id = v_s.business_id
     and p.created_by = v_s.collector_id
     and p.status = 'active'
     and p.payment_method = 'cash'
     and coalesce(p.created_at, p.paid_at) >= v_s.opened_at
     and coalesce(p.created_at, p.paid_at) < coalesce(v_s.closed_at, now());

  select coalesce(sum(p.total_amount), 0) into v_collected_transfer
    from public.payments p
   where p.business_id = v_s.business_id
     and p.created_by = v_s.collector_id
     and p.status = 'active'
     and p.payment_method = 'transfer'
     and coalesce(p.created_at, p.paid_at) >= v_s.opened_at
     and coalesce(p.created_at, p.paid_at) < coalesce(v_s.closed_at, now());

  select coalesce(sum(p.total_amount), 0) into v_collected_other
    from public.payments p
   where p.business_id = v_s.business_id
     and p.created_by = v_s.collector_id
     and p.status = 'active'
     and p.payment_method not in ('cash', 'transfer')
     and coalesce(p.created_at, p.paid_at) >= v_s.opened_at
     and coalesce(p.created_at, p.paid_at) < coalesce(v_s.closed_at, now());

  if v_s.route_id is not null then
    select coalesce(sum(p.total_amount), 0) into v_off_cash
      from public.payments p
     where p.business_id = v_s.business_id
       and p.created_by = v_s.collector_id
       and p.status = 'active'
       and p.payment_method = 'cash'
       and coalesce(p.created_at, p.paid_at) >= v_s.opened_at
       and coalesce(p.created_at, p.paid_at) < coalesce(v_s.closed_at, now())
       and p.client_id not in (select client_id from public.route_clients where route_id = v_s.route_id);

    select coalesce(sum(p.total_amount), 0) into v_off_transfer
      from public.payments p
     where p.business_id = v_s.business_id
       and p.created_by = v_s.collector_id
       and p.status = 'active'
       and p.payment_method = 'transfer'
       and coalesce(p.created_at, p.paid_at) >= v_s.opened_at
       and coalesce(p.created_at, p.paid_at) < coalesce(v_s.closed_at, now())
       and p.client_id not in (select client_id from public.route_clients where route_id = v_s.route_id);

    select coalesce(sum(p.total_amount), 0) into v_off_other
      from public.payments p
     where p.business_id = v_s.business_id
       and p.created_by = v_s.collector_id
       and p.status = 'active'
       and p.payment_method not in ('cash', 'transfer')
       and coalesce(p.created_at, p.paid_at) >= v_s.opened_at
       and coalesce(p.created_at, p.paid_at) < coalesce(v_s.closed_at, now())
       and p.client_id not in (select client_id from public.route_clients where route_id = v_s.route_id);

    select count(distinct p.client_id) into v_collected_clients_route
      from public.payments p
     where p.business_id = v_s.business_id
       and p.created_by = v_s.collector_id
       and p.status = 'active'
       and coalesce(p.created_at, p.paid_at) >= v_s.opened_at
       and coalesce(p.created_at, p.paid_at) < coalesce(v_s.closed_at, now())
       and p.client_id in (select client_id from public.route_clients where route_id = v_s.route_id);

    select count(distinct p.client_id) into v_collected_clients_off
      from public.payments p
     where p.business_id = v_s.business_id
       and p.created_by = v_s.collector_id
       and p.status = 'active'
       and coalesce(p.created_at, p.paid_at) >= v_s.opened_at
       and coalesce(p.created_at, p.paid_at) < coalesce(v_s.closed_at, now())
       and p.client_id not in (select client_id from public.route_clients where route_id = v_s.route_id);
  end if;

  select count(distinct p.client_id) into v_collected_clients
    from public.payments p
   where p.business_id = v_s.business_id
     and p.created_by = v_s.collector_id
     and p.status = 'active'
     and coalesce(p.created_at, p.paid_at) >= v_s.opened_at
     and coalesce(p.created_at, p.paid_at) < coalesce(v_s.closed_at, now());

  select coalesce(sum(l.principal), 0) into v_lent
    from public.loans l
   where l.business_id = v_s.business_id
     and l.created_by = v_s.collector_id
     and l.deleted_at is null
     and l.status <> 'cancelled'
     and l.created_at >= v_s.opened_at
     and l.created_at < coalesce(v_s.closed_at, now());

  select coalesce(sum(e.amount), 0) into v_expenses
    from public.expenses e
   where e.business_id = v_s.business_id
     and e.created_by = v_s.collector_id
     and e.deleted_at is null
     and coalesce(e.created_at, e.expense_date::timestamp) >= v_s.opened_at
     and coalesce(e.created_at, e.expense_date::timestamp) < coalesce(v_s.closed_at, now());

  v_expected := v_s.opening_amount + v_collected_cash - v_lent - v_expenses;

  return jsonb_build_object(
    'session_id', v_s.id,
    'route_id', v_s.route_id,
    'status', v_s.status,
    'opening_amount', v_s.opening_amount,
    'collected_cash', v_collected_cash,
    'collected_transfer', v_collected_transfer,
    'collected_other', v_collected_other,
    'collected_off_route_cash', v_off_cash,
    'collected_off_route_transfer', v_off_transfer,
    'collected_off_route_other', v_off_other,
    'lent', v_lent,
    'expenses', v_expenses,
    'expected_cash', v_expected,
    'delivered_amount', v_s.delivered_amount,
    'difference', v_s.difference,
    'target_amount', coalesce(v_s.target_amount, 0),
    'target_clients', coalesce(v_s.target_clients, 0),
    'collected_clients', v_collected_clients,
    'collected_clients_route', v_collected_clients_route,
    'collected_clients_off_route', v_collected_clients_off
  );
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Corregir set_close_password para impedir sobrescritura sin validación
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_close_password(p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'No has iniciado sesión'; end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'La clave debe tener al menos 6 caracteres';
  end if;
  if exists (select 1 from public.close_passwords where user_id = v_uid) then
    raise exception 'Ya tienes una clave de cierre configurada';
  end if;
  insert into public.close_passwords (user_id, password_hash, updated_at)
  values (v_uid, extensions.crypt(p_password, extensions.gen_salt('bf')), now());
  return true;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Filtrar préstamos borrados (deleted_at IS NULL) en el Portal del Cliente
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_get_summary(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_client uuid; v_biz uuid; v_out jsonb;
begin
  select client_id, business_id into v_client, v_biz from private.portal_resolve_token(p_token);
  if v_client is null then raise exception 'Sesión expirada. Vuelve a entrar.'; end if;
  select jsonb_build_object(
    'client_name', c.full_name,
    'business_name', b.name,
    'business_logo_url', b.logo_url,
    'business_phone', b.phone,
    'business_whatsapp', b.whatsapp,
    'loans_active', (select count(*) from public.loans where client_id = v_client and status = 'active' and deleted_at is null),
    'total_pending', coalesce((select sum(total_pending) from public.installment_details where client_id = v_client and effective_status <> 'paid'), 0)
  ) into v_out
  from public.clients c
  join public.businesses b on b.id = c.business_id
  where c.id = v_client;
  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION public.portal_get_loans(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_client uuid;
begin
  select client_id into v_client from private.portal_resolve_token(p_token);
  if v_client is null then raise exception 'Sesión expirada. Vuelve a entrar.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id,
      'loan_number', l.loan_number,
      'status', l.status,
      'principal', l.principal,
      'current_principal', l.current_principal,
      'frequency', l.frequency,
      'next_due_date', (select min(due_date) from public.installment_details where loan_id = l.id and effective_status <> 'paid'),
      'total_pending', coalesce((select sum(total_pending) from public.installment_details where loan_id = l.id and effective_status <> 'paid'), 0)
    ) order by l.created_at desc)
    from public.loans l
    where l.client_id = v_client
      and l.deleted_at is null
  ), '[]'::jsonb);
end
$function$;

CREATE OR REPLACE FUNCTION public.portal_get_loan_detail(p_token text, p_loan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_client uuid; v_out jsonb;
begin
  select client_id into v_client from private.portal_resolve_token(p_token);
  if v_client is null then raise exception 'Sesión expirada. Vuelve a entrar.'; end if;
  if not exists (select 1 from public.loans where id = p_loan_id and client_id = v_client and deleted_at is null) then
    raise exception 'Préstamo no encontrado';
  end if;
  select jsonb_build_object(
    'loan', (select jsonb_build_object('id', l.id, 'loan_number', l.loan_number, 'status', l.status, 'principal', l.principal, 'current_principal', l.current_principal, 'interest_rate', l.interest_rate, 'frequency', l.frequency, 'first_payment_date', l.first_payment_date) from public.loans l where l.id = p_loan_id and l.deleted_at is null),
    'installments', coalesce((select jsonb_agg(jsonb_build_object(
      'number', i.number, 'due_date', i.due_date, 'total_due', i.total_due, 'total_paid', i.total_paid, 'total_pending', i.total_pending, 'effective_status', i.effective_status
    ) order by i.number) from public.installment_details i where i.loan_id = p_loan_id), '[]'::jsonb)
  ) into v_out;
  return v_out;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Endurecer generate_portal_unlock_code y confirm_portal_unlock
--    (PRNG criptográfico, protección contra colisión multi-negocio y no-enumeración)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_portal_unlock_code(p_document_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  c record; v_count int; v_code text;
begin
  select count(*) into v_count from public.clients
   where document_id = btrim(p_document_id) and deleted_at is null and portal_pin_hash is not null;
  if v_count <> 1 then
    return jsonb_build_object('ok', false, 'message', 'No se pudo iniciar la recuperación. Verifica tu cédula o contacta al negocio.');
  end if;

  select * into c from public.clients
   where document_id = btrim(p_document_id) and deleted_at is null and portal_pin_hash is not null;
  if c.whatsapp is null and c.phone is null then
    return jsonb_build_object('ok', false, 'message', 'No se pudo iniciar la recuperación. Verifica tu cédula o contacta al negocio.');
  end if;
  if c.portal_unlock_requested_at is not null and c.portal_unlock_requested_at > now() - interval '60 seconds' then
    return jsonb_build_object('ok', false, 'message', 'Espera un momento antes de pedir otro código');
  end if;

  v_code := lpad((( ('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint & 2147483647 ) % 900000 + 100000)::text, 6, '0');
  update public.clients set
    portal_unlock_code_hash = extensions.crypt(v_code, extensions.gen_salt('bf')),
    portal_unlock_code_expires_at = now() + interval '10 minutes',
    portal_unlock_attempts = 0,
    portal_unlock_requested_at = now()
  where id = c.id;

  return jsonb_build_object('ok', true, 'code', v_code, 'phone', coalesce(c.whatsapp, c.phone), 'client_name', c.full_name);
end
$function$;

CREATE OR REPLACE FUNCTION public.confirm_portal_unlock(p_document_id text, p_code text, p_new_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  c record; v_count int;
begin
  select count(*) into v_count from public.clients
   where document_id = btrim(p_document_id) and deleted_at is null and portal_pin_hash is not null;
  if v_count <> 1 then
    return jsonb_build_object('ok', false, 'message', 'Código incorrecto o vencido.');
  end if;

  select * into c from public.clients
   where document_id = btrim(p_document_id) and deleted_at is null and portal_pin_hash is not null;

  if c.portal_unlock_code_hash is null or c.portal_unlock_code_expires_at is null or c.portal_unlock_code_expires_at < now() then
    return jsonb_build_object('ok', false, 'message', 'El código venció. Pide uno nuevo.');
  end if;
  if c.portal_unlock_attempts >= 5 then
    return jsonb_build_object('ok', false, 'message', 'Demasiados intentos con este código. Pide uno nuevo.');
  end if;
  if p_new_pin !~ '^[0-9]{4,6}$' then
    return jsonb_build_object('ok', false, 'message', 'El PIN nuevo debe tener entre 4 y 6 dígitos');
  end if;

  if extensions.crypt(p_code, c.portal_unlock_code_hash) <> c.portal_unlock_code_hash then
    update public.clients set portal_unlock_attempts = portal_unlock_attempts + 1 where id = c.id;
    return jsonb_build_object('ok', false, 'message', 'Código incorrecto');
  end if;

  update public.clients set
    portal_pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')),
    portal_pin_set_at = now(), portal_pin_failed_attempts = 0, portal_pin_locked_until = null, portal_pin_lockout_count = 0,
    portal_unlock_code_hash = null, portal_unlock_code_expires_at = null, portal_unlock_attempts = 0
  where id = c.id;
  delete from public.client_portal_sessions where client_id = c.id;
  perform private.log_activity(c.business_id, 'client_portal_pin_reset_via_unlock_code', 'client', c.id, c.id, null, null, null);

  return jsonb_build_object('ok', true);
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) Permisos estrictos de ejecución por rol
-- ─────────────────────────────────────────────────────────────────────────
-- 5a) Funciones internas de staff/SuperAdmin: quitar 'anon' y 'PUBLIC', permitir solo 'authenticated'
REVOKE EXECUTE ON FUNCTION public.open_ruteo(uuid, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ruteo_resumen(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_close_password(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_close_password(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_plan_limit(text, text, integer, integer, integer, boolean, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.open_ruteo(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ruteo_resumen(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_close_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_close_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_plan_limit(text, text, integer, integer, integer, boolean, integer) TO authenticated;

-- 5b) Funciones exclusivas de backend / Edge Functions: quitar 'PUBLIC', 'anon' y 'authenticated', permitir solo 'service_role'
REVOKE ALL ON FUNCTION public.wipe_business_data(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wipe_business_data(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.resolve_api_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_api_key(text) TO service_role;

REVOKE ALL ON FUNCTION public.check_api_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_api_rate_limit(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.generate_portal_unlock_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_portal_unlock_code(text) TO service_role;

REVOKE ALL ON FUNCTION public.nextex_business_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nextex_business_summary(uuid) TO service_role;

-- 5c) Funciones públicas del Portal del Cliente: mantener permiso para 'anon' y 'authenticated'
GRANT EXECUTE ON FUNCTION public.portal_get_summary(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_loans(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_loan_detail(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_portal_unlock(text, text, text) TO anon, authenticated;

COMMIT;
