-- NEXCREDIT-1A — Conector nextex en Capitalia (2026-10-25)
-- Patrón Infinite Smells: cada negocio tiene un nextex_id ('cr' + secuencial) y una llave
-- mini-API. El endpoint GET /api/v1/nextex (función Vercel en api/v1/nextex.js) autentica
-- por esa llave y devuelve el resumen vivo SOLO de ese business_id.
--
-- Cómo aplicar: pegar este archivo completo en el editor SQL de Supabase (proyecto capitalia)
-- y ejecutarlo. No borra ni modifica ningún dato existente: el backfill solo AGREGA identidad
-- a los negocios que no la tienen.

-- 1 · Columnas en businesses -------------------------------------------------------
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS nextex_id text;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS nextex_key text;
CREATE UNIQUE INDEX IF NOT EXISTS businesses_nextex_id_key ON public.businesses (nextex_id);
CREATE UNIQUE INDEX IF NOT EXISTS businesses_nextex_key_key ON public.businesses (nextex_key);
-- Los índices únicos permiten varios NULL (Postgres), así que los negocios viejos no chocan
-- antes del backfill.

-- 2 · Auto-registro: todo negocio nuevo nace con identidad nextex ------------------
-- Cubre TODAS las vías de creación (el trigger private.handle_new_user del registro, el
-- panel del SuperAdmin, etc.), porque actúa sobre el INSERT en businesses, no sobre el form.
CREATE OR REPLACE FUNCTION private.assign_nextex_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE next_seq int;
BEGIN
  IF NEW.nextex_id IS NULL THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(nextex_id FROM 3) AS int)), 0) + 1 INTO next_seq
    FROM public.businesses WHERE nextex_id ~ '^cr[0-9]+$';
    NEW.nextex_id := 'cr' || LPAD(next_seq::text, 4, '0');
  END IF;
  IF NEW.nextex_key IS NULL THEN
    NEW.nextex_key := 'nx_' || encode(gen_random_bytes(24), 'hex');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS businesses_assign_nextex_identity ON public.businesses;
CREATE TRIGGER businesses_assign_nextex_identity
BEFORE INSERT ON public.businesses
FOR EACH ROW EXECUTE FUNCTION private.assign_nextex_identity();

-- 3 · Backfill: solo agrega, nunca toca otros datos ---------------------------------
-- Negocios sin nextex_id reciben cr0001, cr0002… en orden de id; los que ya tienen id pero
-- les falta llave, solo reciben llave. Las filas que ya tienen ambos no se tocan.
DO $$
DECLARE r record; next_seq int;
BEGIN
  FOR r IN SELECT id FROM public.businesses WHERE nextex_id IS NULL ORDER BY id LOOP
    SELECT COALESCE(MAX(CAST(SUBSTRING(nextex_id FROM 3) AS int)), 0) + 1 INTO next_seq
    FROM public.businesses WHERE nextex_id ~ '^cr[0-9]+$';
    UPDATE public.businesses
    SET nextex_id = 'cr' || LPAD(next_seq::text, 4, '0'),
        nextex_key = COALESCE(nextex_key, 'nx_' || encode(gen_random_bytes(24), 'hex'))
    WHERE id = r.id;
  END LOOP;
  UPDATE public.businesses
  SET nextex_key = 'nx_' || encode(gen_random_bytes(24), 'hex')
  WHERE nextex_key IS NULL;
END $$;

-- 4 · Resumen vivo para el endpoint (solo el business_id pedido, nunca otros) --------
-- SECURITY DEFINER: el endpoint entra con service_role y esta función filtra explícitamente
-- por p_business en cada conteo. Sin el filtro, un error aquí mezclaría negocios: por eso cada
-- subconsulta lleva su WHERE business_id = p_business (o el JOIN a loans para pagos).
CREATE OR REPLACE FUNCTION public.nextex_business_summary(p_business uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'clientes_activos', (SELECT count(*) FROM public.clients
      WHERE business_id = p_business AND status = 'active' AND deleted_at IS NULL),
    'prestamos_activos', (SELECT count(*) FROM public.loans
      WHERE business_id = p_business AND status = 'active' AND deleted_at IS NULL),
    'total_prestado', (SELECT COALESCE(SUM(principal), 0) FROM public.loans
      WHERE business_id = p_business AND deleted_at IS NULL),
    'total_cobrado', (SELECT COALESCE(SUM(p.total_amount), 0) FROM public.payments p
      JOIN public.loans l ON l.id = p.loan_id
      WHERE l.business_id = p_business AND p.status = 'active'),
    'gastos_del_mes', (SELECT COALESCE(SUM(amount), 0) FROM public.expenses
      WHERE business_id = p_business AND deleted_at IS NULL
        AND date_trunc('month', expense_date) = date_trunc('month', CURRENT_DATE))
  );
$$;
-- Solo el service_role (el endpoint) puede ejecutarla; nadie la llama desde el front.
REVOKE ALL ON FUNCTION public.nextex_business_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nextex_business_summary(uuid) TO service_role;
