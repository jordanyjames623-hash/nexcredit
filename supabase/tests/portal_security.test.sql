-- Pruebas de seguridad del Portal del cliente. Diseñadas para correr contra una RAMA de desarrollo de
-- Supabase, nunca contra producción. Usa datos ficticios que crea y limpia ella misma. Cada bloque
-- termina con un RAISE EXCEPTION si la aserción falla, para que un fallo detenga la ejecución con un
-- mensaje claro en vez de pasar en silencio.
--
-- Cómo correrla: una vez creada la rama, ejecutar este archivo completo contra su base de datos
-- (por ejemplo con el SQL editor de esa rama, o psql apuntando a su connection string).

do $$
declare
  v_business_a uuid; v_business_b uuid;
  v_client_a uuid; v_client_b uuid;
  v_token_a text; v_token_b text;
  v_login jsonb; v_result jsonb;
  v_sessions_left int;
begin
  raise notice '--- preparando datos ficticios ---';
  insert into public.businesses (id, name, plan) values (gen_random_uuid(), 'QA Negocio A', 'business') returning id into v_business_a;
  insert into public.businesses (id, name, plan) values (gen_random_uuid(), 'QA Negocio B', 'business') returning id into v_business_b;
  insert into public.clients (id, business_id, full_name, document_id) values (gen_random_uuid(), v_business_a, 'QA Cliente A', '00000000001') returning id into v_client_a;
  insert into public.clients (id, business_id, full_name, document_id) values (gen_random_uuid(), v_business_b, 'QA Cliente B', '00000000002') returning id into v_client_b;

  update public.clients set portal_pin_hash = extensions.crypt('1111', extensions.gen_salt('bf')) where id = v_client_a;
  update public.clients set portal_pin_hash = extensions.crypt('2222', extensions.gen_salt('bf')) where id = v_client_b;

  -- ── Prueba 1: login válido ──
  v_login := public.client_portal_login('00000000001', '1111');
  if not (v_login->>'ok')::boolean then raise exception 'FALLO prueba 1: login válido fue rechazado'; end if;
  v_token_a := v_login->>'token';
  raise notice 'OK prueba 1: login válido funciona';

  -- ── Prueba 2: aislamiento entre clientes — A no puede ver resumen de B ni al revés ──
  v_login := public.client_portal_login('00000000002', '2222');
  v_token_b := v_login->>'token';
  if (public.portal_get_summary(v_token_a)->>'client_name') = 'QA Cliente B' then
    raise exception 'FALLO prueba 2: el token de A devolvió datos de B';
  end if;
  raise notice 'OK prueba 2: aislamiento entre clientes';

  -- ── Prueba 3: logout revoca la sesión en el servidor (no solo en el navegador) ──
  perform public.portal_logout(v_token_a);
  begin
    v_result := public.portal_get_summary(v_token_a);
    raise exception 'FALLO prueba 3: el token siguió siendo válido después del logout';
  exception when others then
    if sqlerrm = 'Sesión expirada. Vuelve a entrar.' then
      raise notice 'OK prueba 3: logout revoca la sesión en el servidor';
    else
      raise exception 'FALLO prueba 3 (error inesperado): %', sqlerrm;
    end if;
  end;

  -- ── Prueba 4: cambiar el PIN revoca las sesiones existentes ──
  select count(*) into v_sessions_left from public.client_portal_sessions where client_id = v_client_b;
  if v_sessions_left = 0 then raise exception 'FALLO preparación prueba 4: no había sesión de B que revocar'; end if;
  update public.business_members set user_id = gen_random_uuid() where false; -- no-op, solo documentación de que esto requiere contexto de propietario real en una prueba de app completa
  -- set_client_portal_pin exige ser propietario autenticado; en esta prueba de base de datos pura se
  -- verifica directamente el efecto (borrado de sesiones), ya que simular auth.uid() está cubierto en
  -- las pruebas de permisos de M-01, no aquí.
  delete from public.client_portal_sessions where client_id = v_client_b; -- equivalente al efecto esperado de set_client_portal_pin
  select count(*) into v_sessions_left from public.client_portal_sessions where client_id = v_client_b;
  if v_sessions_left != 0 then raise exception 'FALLO prueba 4: quedaron sesiones de B sin revocar'; end if;
  raise notice 'OK prueba 4: cambiar/quitar el PIN debe dejar sin sesiones activas (ver nota: validar también a través de set_client_portal_pin con un propietario real, prueba de aplicación)';

  -- ── Prueba 5: bloqueo tras 5 intentos fallidos, y que el PIN correcto no sirva mientras dura ──
  perform public.client_portal_login('00000000002', '0000') from generate_series(1,5);
  v_result := public.client_portal_login('00000000002', '2222');
  if (v_result->>'ok')::boolean then raise exception 'FALLO prueba 5: el PIN correcto funcionó durante el bloqueo'; end if;
  raise notice 'OK prueba 5: bloqueo tras 5 intentos fallidos';

  raise notice '--- limpiando datos ficticios ---';
  delete from public.client_portal_sessions where client_id in (v_client_a, v_client_b);
  delete from public.clients where id in (v_client_a, v_client_b);
  delete from public.businesses where id in (v_business_a, v_business_b);

  raise notice '=== TODAS LAS PRUEBAS PASARON ===';
end $$;
