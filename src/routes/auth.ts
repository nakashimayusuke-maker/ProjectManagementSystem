import { Hono } from 'hono'
import { generateSessionId } from '../utils/helpers'

const auth = new Hono<{ Bindings: { DB: D1Database } }>()

// ログイン
auth.post('/login', async (c) => {
  const { username, password } = await c.req.json()
  
  if (!username || !password) {
    return c.json({ error: 'ユーザー名とパスワードを入力してください' }, 400)
  }

  const db = c.env.DB
  const user = await db.prepare(
    'SELECT id, username, email, display_name, role, password_hash, is_active FROM users WHERE username = ?'
  ).bind(username).first<any>()

  if (!user || !user.is_active) {
    return c.json({ error: 'ユーザー名またはパスワードが正しくありません' }, 401)
  }

  // デモ用：パスワードは平文比較（本番ではbcrypt等を使用）
  if (user.password_hash !== password) {
    return c.json({ error: 'ユーザー名またはパスワードが正しくありません' }, 401)
  }

  const sessionId = generateSessionId()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  await db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionId, user.id, expiresAt).run()

  const responseData = {
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
    },
    session_id: sessionId,
  }

  return c.json(responseData)
})

// ログアウト
auth.post('/logout', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const sessionId = body.session_id
  
  if (sessionId) {
    const db = c.env.DB
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
  }

  return c.json({ message: 'ログアウトしました' })
})

// 現在のユーザー情報取得
auth.get('/me', async (c) => {
  const sessionId = getCookieValue(c.req.header('cookie') || '', 'session_id') 
    || c.req.header('x-session-id')
  
  if (!sessionId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const db = c.env.DB
  const session = await db.prepare(
    `SELECT s.user_id, u.username, u.display_name, u.role, u.email
     FROM sessions s JOIN users u ON s.user_id = u.id
     WHERE s.id = ? AND s.expires_at > datetime('now') AND u.is_active = 1`
  ).bind(sessionId).first<any>()

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  return c.json({
    id: session.user_id,
    username: session.username,
    display_name: session.display_name,
    role: session.role,
    email: session.email,
  })
})

// ユーザー一覧（担当者選択用）
auth.get('/users', async (c) => {
  const sessionId = c.req.header('x-session-id')
  if (!sessionId) return c.json({ error: 'Unauthorized' }, 401)

  const db = c.env.DB
  const session = await db.prepare(
    `SELECT s.user_id FROM sessions s WHERE s.id = ? AND s.expires_at > datetime('now')`
  ).bind(sessionId).first<any>()
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const users = await db.prepare(
    'SELECT id, username, display_name, role FROM users WHERE is_active = 1 ORDER BY display_name'
  ).all()

  return c.json(users.results)
})

function getCookieValue(cookieHeader: string, name: string): string | null {
  const cookies = cookieHeader.split(';').map(c => c.trim())
  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.split('=')
    if (key.trim() === name) return valueParts.join('=')
  }
  return null
}

export default auth
