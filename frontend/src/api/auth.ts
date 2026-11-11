import { detectTimezone } from '@/lib/timezone'

import { api } from './client'

export interface User {
  id: number
  name: string
  email: string
  timezone: string
  role: 'user' | 'admin'
  created_at: string
}

interface Message {
  mensagem: string
}

export const authApi = {
  me: (signal?: AbortSignal) => api<User>('/auth/me', { signal }),

  register: (data: { name: string; email: string; password: string; password_confirm: string }) =>
    api<Message>('/auth/register', {
      method: 'POST',
      body: { ...data, timezone: detectTimezone() },
    }),

  login: (data: { email: string; password: string }) =>
    api<User>('/auth/login', { method: 'POST', body: { ...data, timezone: detectTimezone() } }),

  logout: () => api<void>('/auth/logout', { method: 'POST' }),

  logoutOthers: () => api<Message>('/auth/logout-others', { method: 'POST' }),

  verifyEmail: (token: string, password: string) =>
    api<Message>('/auth/verify-email', { method: 'POST', body: { token, password } }),

  resendVerification: (email: string) =>
    api<Message>('/auth/resend-verification', { method: 'POST', body: { email } }),

  forgotPassword: (email: string) =>
    api<Message>('/auth/forgot-password', { method: 'POST', body: { email } }),

  resetPassword: (data: { token: string; password: string; password_confirm: string }) =>
    api<Message>('/auth/reset-password', { method: 'POST', body: data }),

  changePassword: (data: { current_password: string; password: string; password_confirm: string }) =>
    api<Message>('/auth/change-password', { method: 'POST', body: data }),

  updateProfile: (data: { name?: string; timezone?: string }) =>
    api<User>('/users/me', { method: 'PATCH', body: data }),

  deleteAccount: (password: string) =>
    api<void>('/users/me', { method: 'DELETE', body: { password } }),
}
