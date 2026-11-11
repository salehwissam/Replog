import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { authApi, type User } from '@/api/auth'
import { ApiError } from '@/api/client'

export const ME_KEY = ['me'] as const

export function useMe() {
  return useQuery<User | null>({
    queryKey: ME_KEY,
    queryFn: async ({ signal }) => {
      try {
        return await authApi.me(signal)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  })
}

export const SIGNED_OUT_USER: User = {
  id: 0,
  name: '',
  email: '',
  timezone: 'UTC',
  role: 'user',
  created_at: '',
}

export function useCurrentUser(): User {
  const { data } = useMe()
  return data ?? SIGNED_OUT_USER
}

export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      queryClient.clear()
      queryClient.setQueryData(ME_KEY, null)
      navigate('/entrar', { replace: true })
    },
  })
}
