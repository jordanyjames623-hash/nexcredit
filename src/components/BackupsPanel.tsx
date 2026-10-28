import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { HardDriveDownload, ShieldCheck, Eye } from 'lucide-react'
import { supabase, callEdgeFunction } from '@/lib/supabase'

type BackupJob = {
  id: string; backup_type: string; status: string; started_at: string; completed_at: string | null
  size_bytes: number | null; row_counts: Record<string, number> | null; error_message: string | null
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente', in_progress: 'En proceso', completed: 'Completado',
  verified: 'Verificado', failed: 'Fallido', restored: 'Restaurado'
}
const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-neutral', in_progress: 'badge-warning', completed: 'badge-success',
  verified: 'badge-success', failed: 'badge-danger', restored: 'badge-success'
}
const TYPE_LABEL: Record<string, string> = {
  manual: 'Manual', scheduled_daily: 'Automático diario', scheduled_weekly: 'Automático semanal', pre_critical_action: 'Antes de acción crítica'
}

function formatSize(bytes: number | null) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function BackupsPanel() {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [previewJobId, setPreviewJobId] = useState<string | null>(null)

  const { data } = useQuery({
    queryKey: ['backup_jobs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('backup_jobs').select('*').order('started_at', { ascending: false }).limit(20)
      if (error) throw error
      return data as BackupJob[]
    }
  })

  const createBackup = useMutation({
    mutationFn: async () => callEdgeFunction('backup-manager', { action: 'create_backup', backup_type: 'manual' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backup_jobs'] }),
    onError: (e: any) => setError(e.message ?? 'No se pudo crear el backup.')
  })

  const verifyBackup = useMutation({
    mutationFn: async (jobId: string) => callEdgeFunction('backup-manager', { action: 'verify_backup', job_id: jobId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backup_jobs'] }),
    onError: (e: any) => setError(e.message ?? 'No se pudo verificar el backup.')
  })

  const downloadBackup = useMutation({
    mutationFn: async (jobId: string) => callEdgeFunction<{ url: string }>('backup-manager', { action: 'download_backup', job_id: jobId }),
    onSuccess: (data) => window.open(data.url, '_blank'),
    onError: (e: any) => setError(e.message ?? 'No se pudo generar el enlace de descarga.')
  })

  const previewQuery = useQuery({
    queryKey: ['preview_restore', previewJobId],
    enabled: Boolean(previewJobId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('preview_restore', { p_job_id: previewJobId })
      if (error) throw error
      return data as { backup_counts: Record<string, number>; current_counts: Record<string, number>; backup_date: string }
    }
  })

  return (
    <div>
      <p className="mb-3 text-xs text-content-muted">
        Cada backup exporta todos los datos de tu negocio a un archivo privado (nunca público), y se verifica automáticamente al crearse.
        La programación automática diaria/semanal requiere activar una extensión en tu proyecto de Supabase (configuración externa, ver abajo).
      </p>
      {error && <p className="mb-3 rounded bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <button onClick={() => createBackup.mutate()} disabled={createBackup.isPending} className="btn-solid mb-4">
        <HardDriveDownload size={16} className="mr-1.5" /> {createBackup.isPending ? 'Creando y verificando…' : 'Crear backup ahora'}
      </button>

      <div className="space-y-2">
        {(data ?? []).map((job) => (
          <div key={job.id} className="rounded-lg border border-line p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-content">
                  {new Date(job.started_at).toLocaleString('es-DO')} · {TYPE_LABEL[job.backup_type] ?? job.backup_type}
                </p>
                <p className="text-xs text-content-muted">
                  {formatSize(job.size_bytes)}
                  {job.row_counts && ` · ${job.row_counts.clients ?? 0} clientes, ${job.row_counts.loans ?? 0} préstamos, ${job.row_counts.payments ?? 0} pagos`}
                </p>
                {job.error_message && <p className="text-xs text-danger">{job.error_message}</p>}
              </div>
              <span className={STATUS_BADGE[job.status] ?? 'badge-neutral'}>{STATUS_LABEL[job.status] ?? job.status}</span>
            </div>
            {(job.status === 'completed' || job.status === 'verified') && (
              <div className="mt-2 flex flex-wrap gap-3">
                {job.status === 'completed' && (
                  <button onClick={() => verifyBackup.mutate(job.id)} disabled={verifyBackup.isPending} className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <ShieldCheck size={12} /> Verificar
                  </button>
                )}
                <button onClick={() => downloadBackup.mutate(job.id)} disabled={downloadBackup.isPending} className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <HardDriveDownload size={12} /> Descargar
                </button>
                <button onClick={() => setPreviewJobId(previewJobId === job.id ? null : job.id)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <Eye size={12} /> Vista previa de restauración
                </button>
              </div>
            )}
            {previewJobId === job.id && previewQuery.data && (
              <div className="mt-2 grid grid-cols-2 gap-3 rounded bg-background p-3 text-xs">
                <div>
                  <p className="mb-1 font-semibold text-content-muted">En el backup</p>
                  {Object.entries(previewQuery.data.backup_counts).map(([k, v]) => <p key={k} className="text-content-muted">{k}: {v}</p>)}
                </div>
                <div>
                  <p className="mb-1 font-semibold text-content-muted">Ahora mismo</p>
                  {Object.entries(previewQuery.data.current_counts).map(([k, v]) => <p key={k} className="text-content-muted">{k}: {v}</p>)}
                </div>
              </div>
            )}
          </div>
        ))}
        {(data?.length ?? 0) === 0 && <p className="py-6 text-center text-sm text-content-muted">Sin backups todavía.</p>}
      </div>

      <div className="mt-4 border-t border-line pt-4 text-xs text-content-muted">
        <p className="mb-1 font-semibold text-content-muted">Sobre la restauración</p>
        <p>
          Por seguridad, no incluyo un botón que sobrescriba tus datos automáticamente — el riesgo de un error ahí es demasiado alto.
          La "vista previa" te muestra qué cambiaría sin tocar nada. Para una restauración real de emergencia, usa el respaldo automático de
          Supabase (Point-in-Time Recovery, en su panel) o contáctame para hacerlo de forma guiada y auditada.
        </p>
      </div>
    </div>
  )
}
