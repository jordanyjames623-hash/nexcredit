-- Migración 2026-10-26: register_payment guarda la hora real del pago.
--
-- Causa hallada en la definición de la función: p_paid_at era tipo date, no timestamptz.
-- El ISO con hora que manda el frontend (2026-10-26T13:30:00.000Z) se recortaba a fecha
-- y al insertarse en timestamptz quedaba medianoche UTC (2026-10-26 00:00:00+00 = 25/10 8 p. m. RD).
-- Por eso /pagos decía "Ayer" y "Cobrado hoy" quedaba en 0 para pagos del día, aunque el
-- frontend ya mandaba la hora real: el tipo del parámetro la descartaba.
--
-- Cambios, solo estos cuatro:
--  1) p_paid_at pasa de date a timestamptz.
--  2) v_today sigue siendo la fecha RD del instante del pago (para mora, vencimientos,
--     cuotas y reconstrucción del calendario; esa lógica es por fecha y no se toca).
--  3) paid_at guarda el instante real (v_paid_ts), no v_today.
--  4) Se re-aplican los permisos del fix M-01: sin EXECUTE para anon ni public, con
--     EXECUTE para authenticated (el DROP los pierde; sin estas líneas el pago se rompería).
-- Todo en una transacción: si algo falla, la función vieja queda intacta (el DROP sin
-- IF EXISTS aborta antes del CREATE si la firma no coincide).
--
-- Verificación tras correrla: permisos anon=false, authenticated=true; y un pago nuevo
-- debe guardar paid_at con hora real (no 00:00:00+00).

BEGIN;

DROP FUNCTION public.register_payment(uuid, public.payment_type, numeric, numeric, numeric, numeric, text, text, text, text, date);

CREATE FUNCTION public.register_payment(p_loan_id uuid, p_payment_type public.payment_type, p_amount numeric DEFAULT NULL::numeric, p_principal numeric DEFAULT 0, p_interest numeric DEFAULT 0, p_late_fee numeric DEFAULT 0, p_idempotency_key text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_device_info text DEFAULT NULL::text, p_payment_method text DEFAULT 'cash'::text, p_paid_at timestamptz DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_biz uuid := private.current_business_id();
  v_uid uuid := (select auth.uid());
  v_today date := coalesce((p_paid_at at time zone 'America/Santo_Domingo')::date, private.today());
  v_paid_ts timestamptz := coalesce(p_paid_at, now());
  l public.loans%rowtype;
  i public.loan_installments%rowtype;
  v_existing uuid;
  v_before jsonb; v_changed jsonb;
  v_amount numeric := round(p_amount, 2);
  v_pr numeric := round(coalesce(p_principal, 0), 2);
  v_in numeric := round(coalesce(p_interest, 0), 2);
  v_lf numeric := round(coalesce(p_late_fee, 0), 2);
  v_full boolean := false;
  v_rem numeric; rem_m numeric; rem_i numeric;
  pend_m numeric; pend_i numeric; pend_p numeric;
  pay_m numeric; pay_i numeric; pay_p numeric;
  t_cap numeric := 0; t_int numeric := 0; t_mora numeric := 0;
  v_alloc jsonb := '[]'::jsonb;
  v_first uuid;
  v_u_prin numeric; v_m int; v_b numeric;
  v_newcp numeric; v_pending_all numeric; v_new_status public.loan_status;
  v_unpaid int; v_maxn int; k int;
  v_next record;
  v_payment_id uuid; v_receipt int; v_name text;
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_device text;
  v_method text := coalesce(nullif(btrim(p_payment_method), ''), 'cash');
begin
  if v_biz is null then raise exception 'No autorizado' using errcode = '42501'; end if;
  if v_method not in ('cash','transfer','deposit','card','other') then
    raise exception 'Método de pago no válido';
  end if;

  select * into l from public.loans where id = p_loan_id and business_id = v_biz and deleted_at is null for update;
  if not found then raise exception 'Préstamo no encontrado'; end if;
  if not private.can_manage_record(l.business_id, l.created_by, l.assigned_to) then
    raise exception 'No tienes acceso a este préstamo' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing from public.payments where business_id = v_biz and idempotency_key = p_idempotency_key;
    if found then
      return (select to_jsonb(d) from public.payment_details d where d.id = v_existing) || '{"duplicate": true}'::jsonb;
    end if;
  end if;

  if l.status <> 'active' then raise exception 'El préstamo no está activo'; end if;

  case p_payment_type
    when 'regular' then
      if v_amount is not null and v_amount <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
      v_full := v_amount is null;
    when 'principal' then v_pr := coalesce(v_amount, 0);
    when 'interest' then v_in := coalesce(v_amount, 0);
    when 'late_fee' then v_lf := coalesce(v_amount, 0);
    else null;
  end case;
  if p_payment_type <> 'regular' then
    if v_pr < 0 or v_in < 0 or v_lf < 0 or (v_pr + v_in + v_lf) <= 0 then
      raise exception 'Debe indicar un monto mayor que cero';
    end if;
  end if;

  v_device := coalesce(nullif(btrim(p_device_info), ''), nullif(left(v_headers ->> 'user-agent', 200), ''));

  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'principal_due', x.principal_due, 'interest_due', x.interest_due,
           'late_fee_due', x.late_fee_due, 'principal_paid', x.principal_paid, 'interest_paid', x.interest_paid,
           'late_fee_paid', x.late_fee_paid, 'status', x.status)), '[]'::jsonb)
    into v_before from public.loan_installments x where x.loan_id = p_loan_id;

  if p_payment_type = 'regular' then
    v_rem := coalesce(v_amount, 0);
    for i in select * from public.loan_installments where loan_id = p_loan_id and status <> 'paid' order by number loop
      pend_m := private.installment_late_fee(i, l, v_today) - i.late_fee_paid;
      pend_i := i.interest_due - i.interest_paid;
      pend_p := i.principal_due - i.principal_paid;
      continue when pend_m + pend_i + pend_p <= 0;
      if v_full then
        pay_m := pend_m; pay_i := pend_i; pay_p := pend_p;
      else
        pay_m := least(v_rem, pend_m); v_rem := v_rem - pay_m;
        pay_i := least(v_rem, pend_i); v_rem := v_rem - pay_i;
        pay_p := least(v_rem, pend_p); v_rem := v_rem - pay_p;
      end if;
      perform private.pay_installment(i.id, l, pay_m, pay_i, pay_p, v_today);
      t_cap := t_cap + pay_p; t_int := t_int + pay_i; t_mora := t_mora + pay_m;
      v_alloc := v_alloc || jsonb_build_object('installment_id', i.id, 'principal', pay_p, 'interest', pay_i, 'late_fee', pay_m);
      v_first := coalesce(v_first, i.id);
      exit when v_full or v_rem <= 0;
    end loop;
    if not v_full and v_rem > 0 then raise exception 'El monto excede el total pendiente del préstamo'; end if;
    if v_first is null then raise exception 'No hay cuotas pendientes por cobrar'; end if;
  else
    rem_m := v_lf; rem_i := v_in;
    if rem_m > 0 or rem_i > 0 then
      for i in select * from public.loan_installments where loan_id = p_loan_id and status <> 'paid' order by number loop
        exit when rem_m <= 0 and rem_i <= 0;
        pend_m := greatest(0, private.installment_late_fee(i, l, v_today) - i.late_fee_paid);
        pend_i := greatest(0, i.interest_due - i.interest_paid);
        pay_m := least(rem_m, pend_m); pay_i := least(rem_i, pend_i);
        if pay_m + pay_i > 0 then
          perform private.pay_installment(i.id, l, pay_m, pay_i, 0, v_today);
          rem_m := rem_m - pay_m; rem_i := rem_i - pay_i;
          t_mora := t_mora + pay_m; t_int := t_int + pay_i;
          v_alloc := v_alloc || jsonb_build_object('installment_id', i.id, 'principal', 0, 'interest', pay_i, 'late_fee', pay_m);
          v_first := coalesce(v_first, i.id);
        end if;
      end loop;
      if rem_m > 0 then raise exception 'La mora ingresada excede la mora pendiente'; end if;
      if rem_i > 0 then raise exception 'El interés ingresado excede el interés pendiente'; end if;
    end if;

    if v_pr > 0 then
      if v_pr > l.current_principal then
        raise exception 'El pago a capital excede el capital pendiente (%)', l.current_principal;
      end if;
      v_rem := v_pr;
      for i in select * from public.loan_installments
                where loan_id = p_loan_id and principal_due > principal_paid
                  and (due_date <= v_today or principal_paid > 0 or interest_paid > 0 or late_fee_paid > 0)
                order by number loop
        exit when v_rem <= 0;
        pay_p := least(v_rem, i.principal_due - i.principal_paid);
        perform private.pay_installment(i.id, l, 0, 0, pay_p, v_today);
        v_rem := v_rem - pay_p; t_cap := t_cap + pay_p;
        v_alloc := v_alloc || jsonb_build_object('installment_id', i.id, 'principal', pay_p, 'interest', 0, 'late_fee', 0);
        v_first := coalesce(v_first, i.id);
      end loop;

      if v_rem > 0 then
        if l.loan_type = 'capital_interest' then
          select coalesce(sum(principal_due), 0), count(*) into v_u_prin, v_m
            from public.loan_installments
           where loan_id = p_loan_id and status = 'pending' and principal_paid = 0 and interest_paid = 0
             and late_fee_paid = 0 and due_date > v_today;
          if v_rem > v_u_prin then raise exception 'El pago a capital excede el capital pendiente'; end if;
          v_b := v_u_prin - v_rem;
          if v_b = 0 then
            update public.loan_installments set principal_due = 0, interest_due = 0, status = 'paid'
             where loan_id = p_loan_id and status = 'pending' and principal_paid = 0 and interest_paid = 0
               and late_fee_paid = 0 and due_date > v_today;
          elsif l.amortization_method = 'fixed_on_principal' then
            with u as (
              select id, row_number() over (order by number) rn, count(*) over () m, interest_due
                from public.loan_installments
               where loan_id = p_loan_id and status = 'pending' and principal_paid = 0 and interest_paid = 0
                 and late_fee_paid = 0 and due_date > v_today)
            update public.loan_installments t
               set principal_due = case when u.rn < u.m then round(v_b / u.m, 2) else v_b - round(v_b / u.m, 2) * (u.m - 1) end,
                   interest_due = round(u.interest_due * v_b / v_u_prin, 2)
              from u where t.id = u.id;
          else
            with u as (
              select id, row_number() over (order by number) rn
                from public.loan_installments
               where loan_id = p_loan_id and status = 'pending' and principal_paid = 0 and interest_paid = 0
                 and late_fee_paid = 0 and due_date > v_today),
            s as (
              select number as rn, principal_due, interest_due
                from private.build_schedule('capital_interest', l.amortization_method, v_b, l.interest_rate,
                                            'per_period', l.frequency, v_m, v_today))
            update public.loan_installments t
               set principal_due = s.principal_due, interest_due = s.interest_due
              from u join s on s.rn = u.rn where t.id = u.id;
          end if;
        else
          update public.loan_installments
             set interest_due = round((l.current_principal - v_pr) * l.interest_rate / 100, 2),
                 status = case when round((l.current_principal - v_pr) * l.interest_rate / 100, 2) = 0 then 'paid' else status end
           where loan_id = p_loan_id and status = 'pending' and principal_paid = 0 and interest_paid = 0
             and late_fee_paid = 0 and due_date > v_today;
        end if;
        t_cap := t_cap + v_rem;
        v_alloc := v_alloc || jsonb_build_object('installment_id', null, 'principal', v_rem, 'interest', 0, 'late_fee', 0);
      end if;
    end if;
  end if;

  if t_cap + t_int + t_mora <= 0 then raise exception 'No se aplicó ningún monto'; end if;

  v_newcp := l.current_principal - t_cap;
  update public.loans set current_principal = v_newcp where id = p_loan_id;

  if l.loan_type = 'capital_interest' then
    select coalesce(sum(principal_due - principal_paid), 0) into v_pending_all
      from public.loan_installments where loan_id = p_loan_id;
    if abs(v_pending_all - v_newcp) > 0.01 then
      raise exception 'Inconsistencia en el saldo de capital; operación cancelada';
    end if;
  end if;

  select coalesce(sum((x.principal_due - x.principal_paid) + (x.interest_due - x.interest_paid)
                      + (private.installment_late_fee(x, l, v_today) - x.late_fee_paid)), 0)
    into v_pending_all from public.loan_installments x where x.loan_id = p_loan_id;
  v_new_status := case when v_newcp = 0 and v_pending_all <= 0 then 'paid' else 'active' end;
  update public.loans set status = v_new_status where id = p_loan_id;

  if l.loan_type = 'interest_only' and v_new_status = 'active' then
    select count(*) filter (where status <> 'paid'), coalesce(max(number), 0) into v_unpaid, v_maxn
      from public.loan_installments where loan_id = p_loan_id;
    for k in 1..greatest(0, 12 - v_unpaid) loop
      insert into public.loan_installments (business_id, loan_id, number, due_date, principal_due, interest_due)
      values (v_biz, p_loan_id, v_maxn + k, private.add_period(l.first_payment_date, l.frequency, v_maxn + k - 1),
              0, round(v_newcp * l.interest_rate / 100, 2));
    end loop;
  end if;

  select coalesce(jsonb_agg(b.value), '[]'::jsonb) into v_changed
    from jsonb_array_elements(v_before) b(value)
    join public.loan_installments t on t.id = (b.value ->> 'id')::uuid
   where (t.principal_due, t.interest_due, t.late_fee_due, t.principal_paid, t.interest_paid, t.late_fee_paid, t.status::text)
         is distinct from ((b.value ->> 'principal_due')::numeric, (b.value ->> 'interest_due')::numeric,
                           (b.value ->> 'late_fee_due')::numeric, (b.value ->> 'principal_paid')::numeric,
                           (b.value ->> 'interest_paid')::numeric, (b.value ->> 'late_fee_paid')::numeric,
                           b.value ->> 'status');

  select d.number, d.due_date, d.total_pending into v_next
    from public.installment_details d where d.loan_id = p_loan_id and d.status <> 'paid'
   order by d.number limit 1;

  update public.businesses set receipt_seq = receipt_seq + 1 where id = v_biz returning receipt_seq into v_receipt;

  insert into public.payments (business_id, loan_id, client_id, installment_id, receipt_number, payment_type, payment_method,
                               principal_amount, interest_amount, late_fee_amount, notes, idempotency_key, device_info,
                               created_by, state_before, pending_principal_after, next_due_date,
                               next_installment_number, next_installment_amount, paid_at)
  values (v_biz, p_loan_id, l.client_id, v_first, v_receipt, p_payment_type, v_method,
          t_cap, t_int, t_mora, nullif(btrim(p_notes), ''), p_idempotency_key, v_device,
          v_uid,
          jsonb_build_object('loan', jsonb_build_object('current_principal', l.current_principal, 'status', l.status),
                             'installments', v_changed),
          v_newcp, v_next.due_date, v_next.number, v_next.total_pending, v_paid_ts)
  returning id into v_payment_id;

  insert into public.payment_allocations (business_id, payment_id, installment_id, principal_amount, interest_amount, late_fee_amount)
  select v_biz, v_payment_id, nullif(a ->> 'installment_id', '')::uuid,
         (a ->> 'principal')::numeric, (a ->> 'interest')::numeric, (a ->> 'late_fee')::numeric
    from jsonb_array_elements(v_alloc) a;

  select full_name into v_name from public.profiles where id = v_uid;
  insert into public.payment_audit_logs (business_id, payment_id, action, actor_id, actor_name, device_info, client_id, loan_id,
                                         principal_amount, interest_amount, late_fee_amount, total_amount, previous_state, new_state)
  values (v_biz, v_payment_id, 'created', v_uid, v_name, v_device, l.client_id, p_loan_id,
          t_cap, t_int, t_mora, t_cap + t_int + t_mora,
          jsonb_build_object('loan_pending_principal', l.current_principal, 'loan_status', l.status),
          jsonb_build_object('loan_pending_principal', v_newcp, 'loan_status', v_new_status,
                             'receipt_number', v_receipt, 'payment_type', p_payment_type));

  perform private.log_activity(v_biz, 'payment_registered', 'payment', v_payment_id, l.client_id, p_loan_id,
                               t_cap + t_int + t_mora, jsonb_build_object('receipt_number', v_receipt, 'type', p_payment_type));
  if v_new_status = 'paid' and l.status <> 'paid' then
    perform private.log_activity(v_biz, 'loan_settled', 'loan', p_loan_id, l.client_id, p_loan_id, v_newcp, null);
  end if;

  perform private.sync_loan_points(v_biz, p_loan_id);

  return (select to_jsonb(d) from public.payment_details d where d.id = v_payment_id)
         || jsonb_build_object('duplicate', false, 'loan_status', v_new_status);
end $function$;

REVOKE EXECUTE ON FUNCTION public.register_payment(uuid, public.payment_type, numeric, numeric, numeric, numeric, text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_payment(uuid, public.payment_type, numeric, numeric, numeric, numeric, text, text, text, text, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_payment(uuid, public.payment_type, numeric, numeric, numeric, numeric, text, text, text, text, timestamptz) TO authenticated;

COMMIT;

-- OPCIONAL, solo con aprobación de JC (NO correr por defecto): los registros viejos
-- guardados en medianoche UTC pasan a mediodía UTC para que su fecha RD sea el día
-- intended (no cambia montos, recibos ni estados; solo la hora guardada).
-- update public.payments set paid_at = paid_at + interval '12 hours'
--  where paid_at = date_trunc('day', paid_at);
