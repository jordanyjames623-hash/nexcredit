-- Endurecimiento del desbloqueo del portal (2026-11-20).
-- La migración 20261002_portal_unlock_channel.sql SÍ está aplicada en producción
-- (verificado: las 2 funciones y las 4 columnas portal_unlock_* existen), así que
-- este archivo solo reescribe las funciones con CREATE OR REPLACE (conserva los
-- permisos que ya tenían):
-- 1. El código de 6 dígitos se genera con entropía criptográfica
--    (extensions.gen_random_bytes), no con random().
-- 2. Si la cédula no corresponde a exactamente UN cliente elegible, ambas
--    funciones devuelven el mismo mensaje genérico, sin revelar si la cédula
--    existe, si tiene teléfono registrado o si está en varios negocios.
-- 3. confirm_portal_unlock ya no dice "Cédula no encontrada".
create or replace function public.generate_portal_unlock_code(p_document_id text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_count integer; c record; v_code text;
begin
  select count(*) into v_count from public.clients
    where document_id = btrim(p_document_id) and deleted_at is null and portal_pin_hash is not null;
  if v_count <> 1 then
    return jsonb_build_object('ok', false, 'message', 'Si la cédula tiene acceso al portal y un teléfono registrado, recibirás el código en unos minutos.');
  end if;
  select * into c from public.clients
    where document_id = btrim(p_document_id) and deleted_at is null and portal_pin_hash is not null;
  if c.whatsapp is null and c.phone is null then
    return jsonb_build_object('ok', false, 'message', 'Si la cédula tiene acceso al portal y un teléfono registrado, recibirás el código en unos minutos.');
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
end $$;
create or replace function public.confirm_portal_unlock(p_document_id text, p_code text, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_count integer; c record;
begin
  select count(*) into v_count from public.clients
    where document_id = btrim(p_document_id) and deleted_at is null and portal_pin_hash is not null;
  if v_count <> 1 then
    return jsonb_build_object('ok', false, 'message', 'No se pudo completar la solicitud. Verifica los datos e inténtalo de nuevo.');
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
end $$;
