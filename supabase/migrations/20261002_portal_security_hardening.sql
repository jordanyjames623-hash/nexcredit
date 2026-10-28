-- Endurecimiento de seguridad del Portal del cliente.
-- NO APLICADO A NINGÚN ENTORNO TODAVÍA — archivo listo para ejecutarse primero en una rama de desarrollo
-- de Supabase, nunca directo contra producción. Ver supabase/tests/portal_security.test.sql para las
-- pruebas que deben correr contra esa misma rama antes de promover esto a producción.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Logout con revocación real en el servidor (antes: el logout solo
--    borraba sessionStorage; el token seguía válido hasta su expiración).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.portal_logout(p_token text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  delete from public.client_portal_sessions
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  -- Sin RAISE si no existe: un logout de un token ya vencido/inexistente no debe fallar
  -- ni revelar si el token era válido — solo debe terminar en "ya no hay sesión".
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Cambiar o retirar el PIN revoca TODAS las sesiones activas de ese
--    cliente — si alguien tenía el token robado, deja de servirle de inmediato,
--    y si el propietario desactiva el acceso, no queda ninguna sesión viva.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.set_client_portal_pin(p_client_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_biz uuid := private.current_business_id();
begin
  if v_biz is null or not private.is_owner() then
    raise exception 'Solo el propietario puede configurar el acceso al portal' using errcode = '42501';
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN debe tener entre 4 y 6 dígitos';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id and business_id = v_biz and deleted_at is null) then
    raise exception 'Cliente no encontrado';
  end if;
  if (select document_id from public.clients where id = p_client_id) is null then
    raise exception 'El cliente necesita tener la cédula registrada antes de activar su acceso al portal';
  end if;
  update public.clients set
    portal_pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
    portal_pin_set_at = now(), portal_pin_failed_attempts = 0, portal_pin_locked_until = null
  where id = p_client_id;
  -- Un PIN nuevo invalida cualquier sesión abierta con el PIN anterior.
  delete from public.client_portal_sessions where client_id = p_client_id;
  perform private.log_activity(v_biz, 'client_portal_pin_set', 'client', p_client_id, p_client_id, null, null, null);
end $$;

create or replace function public.clear_client_portal_pin(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_biz uuid := private.current_business_id();
begin
  if v_biz is null or not private.is_owner() then
    raise exception 'Solo el propietario puede quitar el acceso al portal' using errcode = '42501';
  end if;
  update public.clients set portal_pin_hash = null, portal_pin_set_at = null, portal_pin_failed_attempts = 0, portal_pin_locked_until = null
    where id = p_client_id and business_id = v_biz;
  -- Retirar el acceso también debe terminar cualquier sesión que ya estuviera abierta.
  delete from public.client_portal_sessions where client_id = p_client_id;
  perform private.log_activity(v_biz, 'client_portal_pin_cleared', 'client', p_client_id, p_client_id, null, null, null);
end $$;

grant execute on function public.portal_logout(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Bloqueo por intentos: se acorta de 15 a 5 minutos.
--    Motivo (revisado a propósito, no es un descuido): un bloqueo largo y fijo es más fuerte contra
--    fuerza bruta, pero también es más fácil de usar como arma contra el DUEÑO real de la cuenta —
--    cualquiera que sepa su cédula puede mantenerlo bloqueado indefinidamente repitiendo un PIN
--    incorrecto cada vez que expira. 5 intentos por 5 minutos sigue siendo una barrera real contra
--    adivinar un PIN de 4-6 dígitos (miles de horas para agotar el espacio de combinaciones), y acorta
--    a una quinta parte el tiempo en que un tercero puede negarle el acceso al dueño legítimo.
--    Esto NO elimina el riesgo de abuso del todo — ver el informe para la limitación que queda pendiente.
create or replace function public.client_portal_login(p_document_id text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  c record; v_count int; v_token text; v_hash text;
begin
  select count(*) into v_count from public.clients
    where document_id = btrim(p_document_id) and deleted_at is null and portal_pin_hash is not null;
  if v_count = 0 then return jsonb_build_object('ok', false, 'message', 'Cédula o PIN incorrecto'); end if;
  if v_count > 1 then return jsonb_build_object('ok', false, 'message', 'No se pudo verificar tu identidad. Contacta al negocio.'); end if;

  select * into c from public.clients
    where document_id = btrim(p_document_id) and deleted_at is null and portal_pin_hash is not null;

  if c.portal_pin_locked_until is not null and c.portal_pin_locked_until > now() then
    return jsonb_build_object('ok', false, 'message', 'Demasiados intentos. Intenta de nuevo en unos minutos.');
  end if;

  if extensions.crypt(p_pin, c.portal_pin_hash) <> c.portal_pin_hash then
    update public.clients set
      portal_pin_failed_attempts = portal_pin_failed_attempts + 1,
      portal_pin_locked_until = case when portal_pin_failed_attempts + 1 >= 5 then now() + interval '5 minutes' else portal_pin_locked_until end
      where id = c.id;
    return jsonb_build_object('ok', false, 'message', 'Cédula o PIN incorrecto');
  end if;

  update public.clients set portal_pin_failed_attempts = 0, portal_pin_locked_until = null where id = c.id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  insert into public.client_portal_sessions (business_id, client_id, token_hash, expires_at)
  values (c.business_id, c.id, v_hash, now() + interval '12 hours');

  return jsonb_build_object('ok', true, 'token', v_token, 'client_name', c.full_name);
end $$;
