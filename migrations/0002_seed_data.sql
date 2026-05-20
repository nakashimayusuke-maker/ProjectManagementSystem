-- シードデータ：ユーザー (パスワードはすべて"password123"のハッシュ)
-- 実際のアプリではハッシュ化するが、デモ用に平文チェック対応
INSERT OR IGNORE INTO users (id, username, email, password_hash, display_name, role) VALUES
(1, 'admin', 'admin@example.com', 'admin123', '管理者 田中', 'admin'),
(2, 'kobayashi', 'kobayashi@example.com', 'pass123', '小林 太郎', 'member'),
(3, 'sato', 'sato@example.com', 'pass123', '佐藤 花子', 'member'),
(4, 'yamada', 'yamada@example.com', 'pass123', '山田 次郎', 'member'),
(5, 'accounting', 'accounting@example.com', 'pass123', '経理 鈴木', 'accounting'),
(6, 'viewer', 'viewer@example.com', 'pass123', '閲覧者 伊藤', 'viewer');

-- 案件データ
INSERT OR IGNORE INTO projects (id, project_no, project_name, client_id, customer_name, owner_user_id, pj, status, is_progress_target, has_recurring_revenue, note) VALUES
(1, 'D1', '旭商工様向けEBISU PIM導入（要件定義）', 'C001', '旭商工株式会社', 2, 'EP-SE', 'active', 0, 0, '要件定義フェーズ'),
(2, 'D2', '佐藤商事様向けEBISU PIM導入', 'C002', '佐藤商事株式会社', 3, 'EP-SE', 'active', 0, 1, '本開発フェーズ'),
(3, 'D3', '中西製作所様向けEBISU PIM導入', 'C003', '中西製作所', 4, 'EP-SE', 'active', 0, 0, '検収済み案件'),
(4, 'S0111', 'イオンリテール株式会社：モールサイト構築', 'C004', 'イオンリテール株式会社', 2, 'EP-Design', 'active', 1, 0, '進行基準対象'),
(5, 'S0112', 'マリークヮント：2.0次', 'C005', 'マリークヮント コスメチックス', 3, 'EP-Design', 'active', 1, 0, '進行基準対象'),
(6, 'S0113', 'SB C&S：サブスク対応', 'C006', 'SB C&S株式会社', 4, 'EP-SE', 'active', 1, 1, '進行基準対象・月額あり'),
(7, 'D4', '山田工業様向け基幹システム刷新', 'C007', '山田工業株式会社', 2, 'EP-SE', 'active', 0, 0, '新規案件'),
(8, 'D5', '田中物産様向けECサイト構築', 'C008', '田中物産株式会社', 3, 'EP-Design', 'closed', 0, 1, '完了案件');

-- 受注・見積情報
INSERT OR IGNORE INTO orders (project_id, order_amount, sales_amount, estimated_profit_rate, has_purchase_order, has_development, estimate_url) VALUES
(1, 1832000, 1832000, 42.5, 1, 0, 'https://drive.google.com/file/d1-estimate'),
(2, 5500000, 5500000, 38.0, 1, 1, 'https://drive.google.com/file/d2-estimate'),
(3, 3200000, 3200000, 45.0, 1, 1, NULL),
(4, 8000000, 7800000, 35.5, 1, 1, 'https://drive.google.com/file/s0111-estimate'),
(5, 4500000, 4350000, 40.0, 1, 1, 'https://drive.google.com/file/s0112-estimate'),
(6, 6200000, 6000000, 37.0, 1, 1, NULL),
(7, 2800000, 2800000, 41.0, 0, 1, NULL),
(8, 1500000, 1500000, 50.0, 1, 1, NULL);

-- 検収・納品情報
INSERT OR IGNORE INTO acceptances (project_id, planned_acceptance_month, acceptance_request_date, acceptance_status, accepted_date, planned_delivery_month, delivery_status, delivery_date, service_start_date, free_months, maintenance_start_date, acceptance_memo, acceptance_document_checked, invoice_sent_date, maintenance_fee_checked, accounting_check_status) VALUES
(1, '2026-06', NULL, 'pending', NULL, '2026-06', 'pending', NULL, NULL, 0, NULL, '要件定義書納品予定', 0, NULL, 0, 'none'),
(2, '2026-08', '2026-05-10', 'requested', NULL, '2026-08', 'pending', NULL, NULL, 0, NULL, NULL, 0, NULL, 0, 'none'),
(3, '2026-03', '2026-03-01', 'done', '2026-03-15', '2026-03', 'done', '2026-03-15', '2026-04-01', 2, '2026-06-01', '検収完了', 1, '2026-03-20', 1, 'confirmed'),
(4, '2026-09', NULL, 'pending', NULL, '2026-09', 'pending', NULL, NULL, 0, NULL, NULL, 0, NULL, 0, 'none'),
(5, '2026-07', '2026-05-15', 'requested', NULL, '2026-07', 'pending', NULL, NULL, 0, NULL, NULL, 0, NULL, 0, 'pending'),
(6, '2026-10', NULL, 'pending', NULL, '2026-10', 'pending', NULL, NULL, 0, NULL, NULL, 0, NULL, 0, 'none'),
(7, '2026-06', NULL, 'pending', NULL, '2026-06', 'pending', NULL, NULL, 0, NULL, NULL, 0, NULL, 0, 'none'),
(8, '2025-12', '2025-12-01', 'done', '2025-12-20', '2025-12', 'done', '2025-12-20', '2026-01-01', 1, '2026-02-01', NULL, 1, '2025-12-25', 1, 'confirmed');

-- 稼働計画
INSERT OR IGNORE INTO work_plans (project_id, target_month, pj, assignee_user_id, assignee_name, allocation_rate, planned_amount, planned_hours, note) VALUES
(1, '2026-05', 'EP-SE', 2, '小林 太郎', 30, 549600, 40, '要件定義'),
(1, '2026-06', 'EP-SE', 2, '小林 太郎', 30, 549600, 40, '要件定義・検収'),
(2, '2026-06', 'EP-SE', 3, '佐藤 花子', 50, 1000000, 80, '基本設計'),
(2, '2026-07', 'EP-SE', 3, '佐藤 花子', 60, 1200000, 96, '詳細設計'),
(2, '2026-08', 'EP-SE', 3, '佐藤 花子', 50, 1000000, 80, '開発'),
(2, '2026-08', 'EP-Design', 4, '山田 次郎', 30, 300000, 48, 'UI設計'),
(4, '2026-06', 'EP-Design', 4, '山田 次郎', 40, 800000, 64, 'デザイン制作'),
(4, '2026-07', 'EP-Design', 4, '山田 次郎', 40, 800000, 64, 'デザイン制作'),
(4, '2026-08', 'EP-SE', 2, '小林 太郎', 40, 1200000, 64, '実装'),
(5, '2026-05', 'EP-Design', 3, '佐藤 花子', 50, 900000, 80, 'デザイン制作'),
(5, '2026-06', 'EP-Design', 3, '佐藤 花子', 50, 900000, 80, 'デザイン実装'),
(5, '2026-07', 'EP-Design', 3, '佐藤 花子', 30, 540000, 48, '検収対応'),
(6, '2026-07', 'EP-SE', 2, '小林 太郎', 50, 1100000, 80, '開発'),
(6, '2026-08', 'EP-SE', 2, '小林 太郎', 50, 1100000, 80, '開発'),
(6, '2026-09', 'EP-SE', 2, '小林 太郎', 40, 880000, 64, '検収対応');

-- 進行基準案件
INSERT OR IGNORE INTO progress_standard_projects (id, project_id, progress_no, is_target, related_project_numbers, dev_owner_user_id, design_owner_user_id, dev_owner_name, design_owner_name, artifact_folder_url, planned_end_month, end_month, status, note) VALUES
(1, 4, 'PS0111', 1, 'S0111', 2, 4, '小林 太郎', '山田 次郎', 'https://drive.google.com/drive/folders/s0111', '2026-09', NULL, 'in_progress', 'モールサイト構築進行基準管理'),
(2, 5, 'PS0112', 1, 'S0112', NULL, 3, NULL, '佐藤 花子', 'https://drive.google.com/drive/folders/s0112', '2026-07', NULL, 'monthly_input_pending', 'マリークヮント2.0次進行基準管理'),
(3, 6, 'PS0113', 1, 'S0113', 2, NULL, '小林 太郎', NULL, NULL, '2026-10', NULL, 'in_progress', 'SB C&Sサブスク対応');

-- 進行基準月次
INSERT OR IGNORE INTO progress_monthlies (progress_standard_project_id, target_month, partner_reported_progress_rate, internal_judged_progress_rate, progress_rate, monthly_sales, cumulative_sales, artifact_url, judgment_basis, input_user_id, input_user_name, input_date, status, note) VALUES
(1, '2026-04', 20, 20, 20, 1560000, 1560000, 'https://drive.google.com/drive/folders/s0111-apr', '基本設計書完成', 2, '小林 太郎', '2026-04-30', 'approved', NULL),
(1, '2026-05', 40, 35, 35, 1170000, 2730000, 'https://drive.google.com/drive/folders/s0111-may', '詳細設計書完成', 2, '小林 太郎', '2026-05-07', 'inputted', NULL),
(2, '2026-04', 30, 30, 30, 1305000, 1305000, 'https://drive.google.com/drive/folders/s0112-apr', 'デザインカンプ完成', 3, '佐藤 花子', '2026-04-28', 'approved', NULL),
(2, '2026-05', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'pending', '入力待ち'),
(3, '2026-04', 15, 15, 15, 900000, 900000, NULL, '要件整理完了', 2, '小林 太郎', '2026-05-02', 'approved', NULL);

-- 月額売上情報
INSERT OR IGNORE INTO recurring_revenues (project_id, has_recurring_revenue, recurring_type, monthly_amount, billing_start_month, revenue_start_month, planned_end_month, contract_status, note) VALUES
(2, 1, '有償保守', 55000, '2026-09', '2026-09', NULL, 'not_started', '保守契約予定'),
(6, 1, 'プレミアムサポート', 120000, '2026-11', '2026-11', NULL, 'not_started', 'サブスク運用サポート'),
(8, 1, '有償保守', 30000, '2026-02', '2026-02', NULL, 'active', '月額保守中');

-- 変更履歴サンプル
INSERT OR IGNORE INTO change_logs (project_id, target_table, target_record_id, target_field, before_value, after_value, change_reason, changed_by, changed_by_name, accounting_confirmation_status) VALUES
(2, 'orders', 2, 'order_amount', '5000000', '5500000', '追加要件対応', 3, '佐藤 花子', 'pending'),
(5, 'acceptances', 5, 'planned_acceptance_month', '2026-06', '2026-07', '開発遅延による見直し', 3, '佐藤 花子', 'pending'),
(3, 'orders', 3, 'sales_amount', '3000000', '3200000', '最終調整', 4, '山田 次郎', 'confirmed');
