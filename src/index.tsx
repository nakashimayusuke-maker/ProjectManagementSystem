import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import auth from './routes/auth'
import projects from './routes/projects'
import workPlans from './routes/workPlans'
import progress from './routes/progress'
import dashboard from './routes/dashboard'
import changeLogs from './routes/changeLogs'
import csv from './routes/csv'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'x-session-id'],
}))

// API ルート
app.route('/api/auth', auth)
app.route('/api/projects', projects)
app.route('/api/work-plans', workPlans)
app.route('/api/progress', progress)
app.route('/api/dashboard', dashboard)
app.route('/api/change-logs', changeLogs)
app.route('/api/csv', csv)

// 静的ファイル（public/static/ ディレクトリ）
app.use('/static/*', serveStatic({ root: './' }))

// ルートアクセスはindex.htmlを返す
app.get('/', serveStatic({ path: './static/index.html' }))
app.get('/static', serveStatic({ path: './static/index.html' }))
app.get('/static/', serveStatic({ path: './static/index.html' }))

// SPAフォールバック（APIルート以外）
app.all('*', (c) => {
  const path = c.req.path
  if (!path.startsWith('/api/')) {
    return c.redirect('/static/index.html')
  }
  return c.json({ error: 'Not Found' }, 404)
})

export default app
