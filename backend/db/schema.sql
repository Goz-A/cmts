DROP TABLE IF EXISTS notifications, change_incident_links, incidents, change_history, approvals, change_requests, users, roles CASCADE;

CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL CHECK (name IN ('Support Engineer','Reviewer','Approver','Administrator'))
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role_id INT NOT NULL REFERENCES roles(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE change_requests (
  id SERIAL PRIMARY KEY,
  ref TEXT UNIQUE,                       -- e.g. CHG-0001
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reason TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Parameter','Product/GL Configuration','Interface/API','Batch Job','Database','Patch')),
  change_type TEXT NOT NULL DEFAULT 'Normal' CHECK (change_type IN ('Standard','Normal','Emergency')),
  application TEXT NOT NULL,             -- e.g. Finacle Core, Internet Banking
  module TEXT NOT NULL,                  -- e.g. CASA, Loans, GL, EOD Batch
  bank_instance TEXT,                    -- bank-specific instance
  environment TEXT NOT NULL CHECK (environment IN ('Development','SIT','UAT','Production')),
  implementation_plan TEXT,
  rollback_plan TEXT,
  tested BOOLEAN NOT NULL DEFAULT FALSE,
  affects_batch BOOLEAN NOT NULL DEFAULT FALSE,
  planned_start TIMESTAMPTZ,
  planned_end TIMESTAMPTZ,
  risk_score INT NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'Low' CHECK (risk_level IN ('Low','Medium','High')),
  risk_factors JSONB NOT NULL DEFAULT '[]',
  requires_cab BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN
    ('Draft','Submitted','Under Review','Approved','Rejected','Returned','Implemented','Monitoring','Closed')),
  outcome TEXT CHECK (outcome IN ('Successful','Failed','Rolled Back')),
  requester_id INT NOT NULL REFERENCES users(id),
  submitted_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  implemented_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cr_status ON change_requests(status);
CREATE INDEX idx_cr_app ON change_requests(application, module);
CREATE INDEX idx_cr_impl ON change_requests(implemented_at);
CREATE INDEX idx_cr_category ON change_requests(category);
CREATE INDEX idx_cr_created ON change_requests(created_at);
CREATE INDEX idx_cr_requester ON change_requests(requester_id);

CREATE TABLE approvals (
  id SERIAL PRIMARY KEY,
  change_id INT NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('Review','Approval')),
  decision TEXT NOT NULL CHECK (decision IN ('Recommended','Approved','Rejected','Returned')),
  approver_id INT NOT NULL REFERENCES users(id),
  comment TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE change_history (
  id SERIAL PRIMARY KEY,
  change_id INT NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  actor_id INT REFERENCES users(id),
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hist_change ON change_history(change_id);

CREATE TABLE incidents (
  id SERIAL PRIMARY KEY,
  ref TEXT UNIQUE,                       -- e.g. INC-0001
  title TEXT NOT NULL,
  description TEXT,
  application TEXT NOT NULL,
  module TEXT NOT NULL,
  bank_instance TEXT,
  priority TEXT NOT NULL CHECK (priority IN ('P1','P2','P3','P4')),
  incident_type TEXT CHECK (incident_type IN ('Batch Failure','Reconciliation','Interface Failure','GL Issue','Transaction Failure','Performance','Other')),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved','Closed')),
  reported_by INT REFERENCES users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_inc_app ON incidents(application, module);
CREATE INDEX idx_inc_opened ON incidents(opened_at);

CREATE TABLE change_incident_links (
  id SERIAL PRIMARY KEY,
  change_id INT NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  incident_id INT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  link_source TEXT NOT NULL CHECK (link_source IN ('Auto','Manual')),
  match_reason TEXT,
  linked_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (change_id, incident_id)
);

CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  change_id INT REFERENCES change_requests(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user ON notifications(user_id, is_read);

INSERT INTO roles(name) VALUES ('Support Engineer'),('Reviewer'),('Approver'),('Administrator');
