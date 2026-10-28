-- Opción C del endurecimiento del Portal: canal de desbloqueo por SMS/WhatsApp.
-- NO APLICADO TODAVÍA — depende de que exista una cuenta de Twilio (o el proveedor que elijas) con
-- credenciales reales. Este archivo deja la base de datos lista; falta desplegar la función Edge
-- (supabase/functions/portal-unlock/index.ts, en este mismo commit) con esas credenciales configuradas,
-- y el cambio de frontend correspondiente, antes de que esto haga algo de verdad.
--
-- Flujo: el cliente bloqueado pide un código de 6 dígitos → se envía a su teléfono YA REGISTRADO
-- (nunca a uno que él escriba en el momento, para que no sirva de nada robarle solo la cédula) → lo
-- confirma junto con un PIN nuevo → la cuenta queda desbloqueada y con ese PIN, sin esperar los minutos
-- del backoff. Esto no reemplaza el backoff (sigue protegiendo contra adivinar el PIN a ciegas); es la
-- salida para cuando el bloqueo es él mismo quien lo sufre, se lo haya provocado él o un tercero.

alter table public.clients
  add column portal_unlock_code_hash text,
  add column portal_unlock_code_expires_at timestamptz,
  add column portal_unlock_attempts integer not null default 0,
  add column portal_unlock_requested_at timestamptz;

-- Genera el código y lo guarda. NUNCA se otorga a "anon": solo la función Edge (con la llave de
-- servicio) debe poder llamarla, porque es la única que recibe el código en claro para enviarlo por
-- SMS/WhatsApp. Si "anon" pudiera llamarla directo, cualquiera vería el código en la respuesta.
create or replace function public.generate_portal_unlock_code(p_document_id text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare c record; v_code text;
begin
  select * into c from public.clients
    where document_id = btrim(p_document_id) and deleted_at is null and portal_pin_hash is not null;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Cliente no encontrado o sin acceso al portal activado');
  end if;
  if c.whatsapp is null and c.phone is null then
    return jsonb_build_object('ok', false, 'message', 'Este cliente no tiene un teléfono registrado para enviar el código');
  end if;
  if c.portal_unlock_requested_at is not null and c.portal_unlock_requested_at > now() - interval '60 seconds' then
    return jsonb_build_object('ok', false, 'message', 'Espera un momento antes de pedir otro código');
  end if;

  v_code := lpad(floor(random() * 900000 + 100000)::text, 6, '0');
  update public.clients set
    portal_unlock_code_hash = extensions.crypt(v_code, extensions.gen_salt('bf')),
    portal_unlock_code_expires_at = now() + interval '10 minutes',
    portal_unlock_attempts = 0,
    portal_unlock_requested_at = now()
  where id = c.id;

  -- El código en claro solo lo ve quien llama esta función (la función Edge, nunca el navegador).
  return jsonb_build_object('ok', true, 'code', v_code, 'phone', coalesce(c.whatsapp, c.phone), 'client_name', c.full_name);
end $$;

-- Esta SÍ la llama el navegador directo, como client_portal_login — pero nunca devuelve el código,
-- solo confirma si el que el cliente escribió coincide con el que se le envió.
create or replace function public.confirm_portal_unlock(p_document_id text, p_code text, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare c record;
begin
  select * into c from public.clients
    where document_id = btrim(p_document_id) and deleted_at is null and portal_pin_hash is not null;
  if not found then return jsonb_build_object('ok', false, 'message', 'Cédula no encontrada'); end if;

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
end $$;

-- generate_portal_unlock_code: SOLO la función Edge (service_role). confirm_portal_unlock: el navegador.
revoke execute on function public.generate_portal_unlock_code(text) from public;
grant execute on function public.confirm_portal_unlock(text, text, text) to anon, authenticated;
