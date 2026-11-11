import { z } from 'zod'

export const PASSWORD_MIN = 10

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Informe seu e-mail.')
  .max(254, 'E-mail muito longo.')
  .email('Informe um e-mail válido.')

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN, `A senha deve ter pelo menos ${PASSWORD_MIN} caracteres.`)
  .max(128, 'A senha deve ter no máximo 128 caracteres.')

export function withConfirmation<T extends z.ZodRawShape>(shape: T) {
  return z
    .object({ ...shape, password: newPasswordSchema, password_confirm: z.string() })
    .refine((d) => {
      const v = d as { password: string; password_confirm: string }
      return v.password === v.password_confirm
    }, {
      message: 'As senhas não conferem.',
      path: ['password_confirm'],
    })
}

export function passwordStrength(pwd: string): { level: 0 | 1 | 2 | 3; label: string } {
  if (!pwd) return { level: 0, label: '' }
  let score = 0
  if (pwd.length >= PASSWORD_MIN) score++
  if (pwd.length >= 14) score++
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++
  if (/\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++
  if (pwd.length < PASSWORD_MIN) return { level: 1, label: 'Curta demais' }
  if (score <= 2) return { level: 1, label: 'Fraca' }
  if (score === 3) return { level: 2, label: 'Boa' }
  return { level: 3, label: 'Forte' }
}
