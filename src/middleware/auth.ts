import { Context, Next } from 'hono'

export type UserRole = 'admin' | 'member' | 'accounting' | 'viewer'

export interface AuthUser {
  id: number
  username: string
  display_name: string
  role: UserRole
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser
  }
}

export async function authMiddleware(c: Context, next: Next) {
  // x-session-id ヘッダーまたはCookieからセッションIDを取得
  const sessionId = c.req.header('x-session-id') 
    || getCookieValue(c.req.header('cookie') || '', 'session_id')
  
  if (!sessionId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const db = (c.env as any).DB as D1Database
  
  const session = await db.prepare(
    `SELECT s.user_id, u.username, u.display_name, u.role, u.is_active
     FROM sessions s JOIN users u ON s.user_id = u.id
     WHERE s.id = ? AND s.expires_at > datetime('now') AND u.is_active = 1`
  ).bind(sessionId).first<{ user_id: number; username: string; display_name: string; role: string; is_active: number }>()

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  c.set('user', {
    id: session.user_id,
    username: session.username,
    display_name: session.display_name,
    role: session.role as UserRole,
  })

  await next()
}

export function requireRole(...roles: UserRole[]) {
  return async (c: Context, next: Next) => {
    const user = c.get('user')
    if (!user || !roles.includes(user.role)) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  }
}

export function canEdit(user: AuthUser, ownerUserId?: number | null): boolean {
  if (user.role === 'admin' || user.role === 'accounting') return true
  if (user.role === 'member' && ownerUserId === user.id) return true
  return false
}

function getCookieValue(cookieHeader: string, name: string): string | null {
  const cookies = cookieHeader.split(';').map(c => c.trim())
  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.split('=')
    if (key.trim() === name) return valueParts.join('=')
  }
  return null
}
