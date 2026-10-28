-- APLICADO el 2026-10-02 directamente en producción (verificado en vivo con datos ficticios, sin dejar
-- residuos: 4 pruebas, incluida la reversión automática de Postgres al terminar con un error controlado).
-- Reemplaza el bloqueo fijo de 5 minutos por uno escalonado: 2 min el primer bloqueo consecutivo, 5 min
-- el segundo, 15 min el tercero en adelante. El dueño real de la cuenta recupera el acceso rápido la
-- primera vez que alguien lo bloquea sin querer (o a propósito); un atacante persistente lo paga cada vez
-- más caro. Se reinicia a cero con un login correcto, o si el propietario cambia/quita el PIN del cliente.

alter table public.clients add column portal_pin_lockout_count integer not null default 0;

create or replace function public.client_portal_login(p_document_id text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  c record; v_count int; v_token text; v_hash text;
  v_new_attempts int; v_new_lockout_count int; v_lock_minutes int;
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
    v_new_attempts := c.portal_pin_failed_attempts + 1;
    if v_new_attempts >= 5 then
      v_new_lockout_count := c.portal_pin_lockout_count + 1;
      v_lock_minutes := case when v_new_lockout_count = 1 then 2 when v_new_lockout_count = 2 then 5 else 15 end;
      update public.clients set
        portal_pin_failed_attempts = 0,
        portal_pin_lockout_count = v_new_lockout_count,
        portal_pin_locked_until = now() + (v_lock_minutes || ' minutes')::interval
        where id = c.id;
    else
      update public.clients set portal_pin_failed_attempts = v_new_attempts where id = c.id;
    end if;
    return jsonb_build_object('ok', false, 'message', 'Cédula o PIN incorrecto');
  end if;

  update public.clients set portal_pin_failed_attempts = 0, portal_pin_locked_until = null, portal_pin_lockout_count = 0 where id = c.id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  insert into public.client_portal_sessions (business_id, client_id, token_hash, expires_at)
  values (c.business_id, c.id, v_hash, now() + interval '12 hours');

  return jsonb_build_object('ok', true, 'token', v_token, 'client_name', c.full_name);
end $$;

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
    portal_pin_set_at = now(), portal_pin_failed_attempts = 0, portal_pin_locked_until = null, portal_pin_lockout_count = 0
  where id = p_client_id;
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
  update public.clients set portal_pin_hash = null, portal_pin_set_at = null, portal_pin_failed_attempts = 0, portal_pin_locked_until = null, portal_pin_lockout_count = 0
    where id = p_client_id and business_id = v_biz;
  delete from public.client_portal_sessions where client_id = p_client_id;
  perform private.log_activity(v_biz, 'client_portal_pin_cleared', 'client', p_client_id, p_client_id, null, null, null);
end $$;
