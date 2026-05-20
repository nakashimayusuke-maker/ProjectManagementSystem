import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'

const dashboard = new Hono<{ Bindings: { DB: D1Database } }>()
dashboard.use('*', authMiddleware)

dashboard.get('/', async (c) => {
  const db = c.env.DB
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const nextMonth = now.getMonth() === 11
    ? `${now.getFullYear() + 1}-01`
    : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}`

  // 今月検収予定
  const thisMonthAcceptance = await db.prepare(
    `SELECT COUNT(*) as cnt FROM acceptances WHERE planned_acceptance_month = ? AND acceptance_status != 'done'`
  ).bind(currentMonth).first<any>()

  // 来月検収予定
  const nextMonthAcceptance = await db.prepare(
    `SELECT COUNT(*) as cnt FROM acceptances WHERE planned_acceptance_month = ?`
  ).bind(nextMonth).first<any>()

  // 検収予定月未設定
  const noAcceptanceMonth = await db.prepare(
    `SELECT COUNT(*) as cnt FROM acceptances a
     JOIN projects p ON a.project_id = p.id
     WHERE a.planned_acceptance_month IS NULL AND p.status = 'active'`
  ).first<any>()

  // 検収依頼日未入力（activeな案件）
  const noRequestDate = await db.prepare(
    `SELECT COUNT(*) as cnt FROM acceptances a
     JOIN projects p ON a.project_id = p.id
     WHERE a.acceptance_request_date IS NULL AND a.acceptance_status = 'pending' AND p.status = 'active'`
  ).first<any>()

  // 進行基準対象案件数
  const progressTargetCount = await db.prepare(
    `SELECT COUNT(*) as cnt FROM progress_standard_projects WHERE is_target = 1`
  ).first<any>()

  // 当月の進行基準月次未入力
  const progressPendingCount = await db.prepare(
    `SELECT COUNT(*) as cnt FROM progress_standard_projects psp
     WHERE psp.is_target = 1
     AND NOT EXISTS (
       SELECT 1 FROM progress_monthlies pm
       WHERE pm.progress_standard_project_id = psp.id
       AND pm.target_month = ?
       AND pm.status != 'pending'
     )`
  ).bind(currentMonth).first<any>()

  // 経理確認待ち変更件数
  const accountingPendingCount = await db.prepare(
    `SELECT COUNT(*) as cnt FROM change_logs WHERE accounting_confirmation_status = 'pending'`
  ).first<any>()

  // 月額売上あり案件数
  const recurringCount = await db.prepare(
    `SELECT COUNT(*) as cnt FROM projects WHERE has_recurring_revenue = 1`
  ).first<any>()

  // アラート生成
  const alerts: any[] = []

  // 今月検収予定なのに検収依頼日未入力
  const alertNoRequest = await db.prepare(`
    SELECT p.project_no, p.project_name FROM acceptances a
    JOIN projects p ON a.project_id = p.id
    WHERE a.planned_acceptance_month = ? AND a.acceptance_request_date IS NULL
    AND a.acceptance_status != 'done'
  `).bind(currentMonth).all()
  for (const r of alertNoRequest.results as any[]) {
    alerts.push({ level: 'error', message: `検収依頼日未入力`, detail: `${r.project_no} ${r.project_name}（今月検収予定）` })
  }

  // 検収予定月が過去なのに検収日未入力
  const alertOverdue = await db.prepare(`
    SELECT p.project_no, p.project_name, a.planned_acceptance_month FROM acceptances a
    JOIN projects p ON a.project_id = p.id
    WHERE a.planned_acceptance_month < ? AND a.accepted_date IS NULL
    AND a.planned_acceptance_month IS NOT NULL
    AND p.status = 'active'
  `).bind(currentMonth).all()
  for (const r of alertOverdue.results as any[]) {
    alerts.push({ level: 'error', message: `検収未完了（期限超過）`, detail: `${r.project_no} ${r.project_name}（${r.planned_acceptance_month}）` })
  }

  // 進行基準対象で当月進捗率未入力
  const alertNoProgress = await db.prepare(`
    SELECT p.project_no, p.project_name FROM progress_standard_projects psp
    JOIN projects p ON psp.project_id = p.id
    WHERE psp.is_target = 1
    AND NOT EXISTS (
      SELECT 1 FROM progress_monthlies pm
      WHERE pm.progress_standard_project_id = psp.id
      AND pm.target_month = ?
      AND pm.progress_rate IS NOT NULL
    )
  `).bind(currentMonth).all()
  for (const r of alertNoProgress.results as any[]) {
    alerts.push({ level: 'warning', message: `当月進捗率未入力`, detail: `${r.project_no} ${r.project_name}` })
  }

  // 進行基準対象で成果物URLなし
  const alertNoArtifact = await db.prepare(`
    SELECT p.project_no, p.project_name FROM progress_standard_projects psp
    JOIN projects p ON psp.project_id = p.id
    WHERE psp.is_target = 1 AND (psp.artifact_folder_url IS NULL OR psp.artifact_folder_url = '')
    AND psp.status NOT IN ('completed', 'excluded')
  `).all()
  for (const r of alertNoArtifact.results as any[]) {
    alerts.push({ level: 'warning', message: `成果物フォルダURL未設定`, detail: `${r.project_no} ${r.project_name}` })
  }

  // 経理確認待ち変更あり
  const alertAccounting = await db.prepare(`
    SELECT DISTINCT p.project_no, p.project_name FROM change_logs cl
    JOIN projects p ON cl.project_id = p.id
    WHERE cl.accounting_confirmation_status = 'pending'
    LIMIT 5
  `).all()
  for (const r of alertAccounting.results as any[]) {
    alerts.push({ level: 'warning', message: `経理確認待ち変更あり`, detail: `${r.project_no} ${r.project_name}` })
  }

  // 保守費用発生月日が必要そうだが未入力
  const alertNoMaintenance = await db.prepare(`
    SELECT p.project_no, p.project_name FROM acceptances a
    JOIN projects p ON a.project_id = p.id
    WHERE a.accepted_date IS NOT NULL
    AND a.maintenance_start_date IS NULL
    AND a.service_start_date IS NOT NULL
    AND p.status = 'active'
  `).all()
  for (const r of alertNoMaintenance.results as any[]) {
    alerts.push({ level: 'info', message: `保守費用発生月日未設定`, detail: `${r.project_no} ${r.project_name}（利用開始日あり）` })
  }

  return c.json({
    stats: {
      this_month_acceptance: thisMonthAcceptance?.cnt ?? 0,
      next_month_acceptance: nextMonthAcceptance?.cnt ?? 0,
      no_acceptance_month: noAcceptanceMonth?.cnt ?? 0,
      no_request_date: noRequestDate?.cnt ?? 0,
      progress_target_count: progressTargetCount?.cnt ?? 0,
      progress_pending_count: progressPendingCount?.cnt ?? 0,
      accounting_pending_count: accountingPendingCount?.cnt ?? 0,
      recurring_count: recurringCount?.cnt ?? 0,
    },
    alerts,
    current_month: currentMonth,
  })
})

export default dashboard
