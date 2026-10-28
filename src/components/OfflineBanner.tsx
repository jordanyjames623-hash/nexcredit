import { useOnlineStatus } from '@/hooks/useOnlineStatus'

export function OfflineBanner() {
  const isOnline = useOnlineStatus()
  if (isOnline) return null

  return (
    <div className="bg-danger px-4 py-2 text-center text-sm font-medium text-on-navy" role="status">
      Sin conexión — estás viendo datos guardados. Los pagos y préstamos no se pueden registrar hasta reconectar.
    </div>
  )
}
