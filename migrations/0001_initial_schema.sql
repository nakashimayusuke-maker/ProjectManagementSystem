-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'member', 'accounting', 'viewer')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 案件テーブル
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_no TEXT UNIQUE NOT NULL,
  project_name TEXT NOT NULL,
  client_id TEXT,
  customer_name TEXT,
  owner_user_id INTEGER,
  pj TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closed', 'cancelled', 'on_hold')),
  is_progress_target INTEGER NOT NULL DEFAULT 0,
  has_recurring_revenue INTEGER NOT NULL DEFAULT 0,
  recurring_revenue_memo TEXT,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

-- 受注・見積情報テーブル
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL UNIQUE,
  order_amount REAL,
  sales_amount REAL,
  estimated_profit_rate REAL,
  has_purchase_order INTEGER NOT NULL DEFAULT 0,
  has_development INTEGER NOT NULL DEFAULT 0,
  estimate_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- 検収・納品テーブル
CREATE TABLE IF NOT EXISTS acceptances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL UNIQUE,
  planned_acceptance_month TEXT,
  acceptance_request_date TEXT,
  acceptance_status TEXT DEFAULT 'pending' CHECK(acceptance_status IN ('pending', 'requested', 'done')),
  accepted_date TEXT,
  planned_delivery_month TEXT,
  delivery_status TEXT DEFAULT 'pending' CHECK(delivery_status IN ('pending', 'done')),
  delivery_date TEXT,
  service_start_date TEXT,
  free_months INTEGER DEFAULT 0,
  maintenance_start_date TEXT,
  acceptance_memo TEXT,
  acceptance_document_checked INTEGER NOT NULL DEFAULT 0,
  invoice_sent_date TEXT,
  maintenance_fee_checked INTEGER NOT NULL DEFAULT 0,
  accounting_check_status TEXT DEFAULT 'none' CHECK(accounting_check_status IN ('none', 'pending', 'confirmed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- 稼働計画テーブル
CREATE TABLE IF NOT EXISTS work_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  target_month TEXT NOT NULL,
  pj TEXT,
  assignee_user_id INTEGER,
  assignee_name TEXT,
  allocation_rate REAL,
  planned_amount REAL,
  planned_hours REAL,
  locked INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (assignee_user_id) REFERENCES users(id)
);

-- 進行基準案件テーブル
CREATE TABLE IF NOT EXISTS progress_standard_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  progress_no TEXT,
  is_target INTEGER NOT NULL DEFAULT 0,
  related_project_numbers TEXT,
  dev_owner_user_id INTEGER,
  design_owner_user_id INTEGER,
  dev_owner_name TEXT,
  design_owner_name TEXT,
  artifact_folder_url TEXT,
  planned_end_month TEXT,
  end_month TEXT,
  status TEXT DEFAULT 'not_started' CHECK(status IN ('not_started', 'in_progress', 'monthly_input_pending', 'monthly_input_done', 'completed', 'excluded')),
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (dev_owner_user_id) REFERENCES users(id),
  FOREIGN KEY (design_owner_user_id) REFERENCES users(id)
);

-- 進行基準月次テーブル
CREATE TABLE IF NOT EXISTS progress_monthlies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  progress_standard_project_id INTEGER NOT NULL,
  target_month TEXT NOT NULL,
  partner_reported_progress_rate REAL,
  internal_judged_progress_rate REAL,
  progress_rate REAL,
  monthly_sales REAL,
  cumulative_sales REAL,
  artifact_url TEXT,
  judgment_basis TEXT,
  input_user_id INTEGER,
  input_user_name TEXT,
  input_date TEXT,
  approver_user_id INTEGER,
  approver_name TEXT,
  approved_date TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'inputted', 'approved')),
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (progress_standard_project_id) REFERENCES progress_standard_projects(id),
  FOREIGN KEY (input_user_id) REFERENCES users(id),
  FOREIGN KEY (approver_user_id) REFERENCES users(id)
);

-- 月額売上テーブル
CREATE TABLE IF NOT EXISTS recurring_revenues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  has_recurring_revenue INTEGER NOT NULL DEFAULT 0,
  recurring_type TEXT,
  monthly_amount REAL,
  billing_start_month TEXT,
  revenue_start_month TEXT,
  planned_end_month TEXT,
  contract_status TEXT DEFAULT 'not_started' CHECK(contract_status IN ('not_started', 'active', 'suspended', 'terminated')),
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- 変更履歴テーブル
CREATE TABLE IF NOT EXISTS change_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  target_table TEXT NOT NULL,
  target_record_id INTEGER,
  target_field TEXT NOT NULL,
  before_value TEXT,
  after_value TEXT,
  change_reason TEXT,
  changed_by INTEGER,
  changed_by_name TEXT,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  accounting_confirmation_status TEXT DEFAULT 'none' CHECK(accounting_confirmation_status IN ('none', 'pending', 'confirmed')),
  accounting_confirmed_by INTEGER,
  accounting_confirmed_by_name TEXT,
  accounting_confirmed_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (changed_by) REFERENCES users(id)
);

-- CSVインポート履歴テーブル
CREATE TABLE IF NOT EXISTS csv_import_histories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  imported_by INTEGER,
  imported_by_name TEXT,
  imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_rows INTEGER DEFAULT 0,
  created_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  result_detail TEXT,
  FOREIGN KEY (imported_by) REFERENCES users(id)
);

-- セッションテーブル
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_projects_project_no ON projects(project_no);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_acceptances_planned_month ON acceptances(planned_acceptance_month);
CREATE INDEX IF NOT EXISTS idx_work_plans_project ON work_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_work_plans_month ON work_plans(target_month);
CREATE INDEX IF NOT EXISTS idx_progress_monthlies_psp ON progress_monthlies(progress_standard_project_id);
CREATE INDEX IF NOT EXISTS idx_progress_monthlies_month ON progress_monthlies(target_month);
CREATE INDEX IF NOT EXISTS idx_change_logs_project ON change_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_change_logs_accounting ON change_logs(accounting_confirmation_status);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
