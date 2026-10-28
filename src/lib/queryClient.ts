import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1
    },
    mutations: {
      // Nunca reintentar automáticamente una escritura financiera: si falla, el usuario
      // debe verlo y decidir, para no arriesgar un pago duplicado.
      retry: false
    }
  }
})
