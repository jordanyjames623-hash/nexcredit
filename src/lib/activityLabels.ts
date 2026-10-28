// Etiquetas legibles de las acciones registradas en el historial (usadas por el Historial y el Dashboard).
export const ACTION_LABEL: Record<string, string> = {
  client_created: 'Cliente creado', client_updated: 'Cliente editado', client_deleted: 'Cliente eliminado',
  loan_created: 'Préstamo creado', loan_updated: 'Préstamo editado',
  payment_registered: 'Pago registrado', payment_voided: 'Pago anulado',
  collaborator_permissions_updated: 'Permisos actualizados', collaborator_activated: 'Colaborador activado',
  collaborator_deactivated: 'Colaborador desactivado', all_data_wiped: 'Datos del negocio eliminados',
  application_created: 'Solicitud registrada', application_in_review: 'Solicitud en evaluación',
  application_approved: 'Solicitud aprobada', application_rejected: 'Solicitud rechazada', application_disbursed: 'Solicitud desembolsada',
  api_key_created: 'Llave de API creada', api_key_revoked: 'Llave de API revocada',
  member_branch_changed: 'Sucursal de colaborador cambiada', collection_escalated: 'Cobranza escalada'
}

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action.replace(/_/g, ' ')
}
