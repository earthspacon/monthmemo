-- Better Auth tables (renamed + snake_case through the auth config)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Google tokens are stored encrypted by Better Auth (account.encryptOAuthTokens).
CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY,
  provider_account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TEXT,
  refresh_token_expires_at TEXT,
  scope TEXT,
  password TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX auth_identities_user ON auth_identities(user_id);

-- OAuth state of the sign-in and connect redirects.
CREATE TABLE verifications (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX verifications_identifier ON verifications(identifier);

-- One agency per Google user.
CREATE TABLE agencies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'growth')),
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  trial_ends_at TEXT,
  paddle_customer_id TEXT,
  paddle_subscription_id TEXT UNIQUE,
  display_name TEXT NOT NULL,
  accent_color TEXT NOT NULL DEFAULT '#2563eb',
  logo_url TEXT,
  reply_to TEXT NOT NULL,
  google_needs_reconnect INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ga4_property_id TEXT,
  ga4_property_name TEXT,
  gsc_site_url TEXT,
  created_at TEXT NOT NULL,
  CHECK (ga4_property_id IS NOT NULL OR gsc_site_url IS NOT NULL)
);
CREATE INDEX clients_agency ON clients(agency_id, created_at);

CREATE TABLE recipients (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  unsubscribed_at TEXT
);
CREATE INDEX recipients_client ON recipients(client_id);

-- One report per client and month; the minute job moves it through its statuses.
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'building', 'draft', 'failed', 'sending', 'sent', 'send_failed', 'skipped')
  ),
  metrics_json TEXT,
  narrative TEXT,
  failure_reason TEXT CHECK (
    failure_reason IS NULL
    OR failure_reason IN ('narrative_failed', 'google_reconnect_needed', 'source_not_found', 'google_error')
  ),
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (client_id, period)
);
CREATE INDEX reports_status ON reports(status, updated_at);
CREATE INDEX reports_agency_period ON reports(agency_id, period);

CREATE TABLE report_deliveries (
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (report_id, recipient_id)
);

-- LLM spend per UTC day and agency, in USD. The daily caps read it before every narrative.
CREATE TABLE llm_usage (
  day TEXT NOT NULL,
  agency_id TEXT NOT NULL,
  cost_usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (day, agency_id)
);

CREATE TABLE owner_alerts (
  kind TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (kind, day)
);

-- Once-per-run agency emails (failed clients, drafts ready, send failed).
CREATE TABLE agency_notices (
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  kind TEXT NOT NULL,
  PRIMARY KEY (agency_id, period, kind)
);

CREATE TABLE rate_limit_hits (
  key TEXT NOT NULL,
  hit_at TEXT NOT NULL
);
CREATE INDEX rate_limit_hits_key_at ON rate_limit_hits (key, hit_at);

-- Local-only mail log used by the dev outbox route.
CREATE TABLE dev_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  html TEXT,
  created_at TEXT NOT NULL
);
