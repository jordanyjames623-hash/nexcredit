-- SEC-006 (Tanda 2, decisión JC 2026-10-27): bloquear el borrado lógico de
-- clientes con préstamos activos. Solo cambia el WITH CHECK de clients_update;
-- el USING queda intacto. El WITH CHECK se evalúa sobre la fila NUEVA: si
-- deleted_at pasa a no-nulo (un borrado), no debe existir ningún préstamo
-- activo sin borrar de ese cliente. service_role no pasa por RLS, así que los
-- procesos admin (wipe, etc.) no se ven afectados.
ALTER POLICY clients_update ON public.clients
WITH CHECK (
  business_id = private.current_business_id()
  AND (
    deleted_at IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.client_id = clients.id
        AND l.status = 'active'
        AND l.deleted_at IS NULL
    )
  )
);
