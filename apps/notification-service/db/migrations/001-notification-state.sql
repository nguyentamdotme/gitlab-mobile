CREATE TABLE service_sessions (
  id uuid PRIMARY KEY,
  instance_id text NOT NULL,
  user_id bigint NOT NULL,
  device_id uuid NOT NULL,
  access_hash text NOT NULL UNIQUE,
  refresh_hash text NOT NULL UNIQUE,
  cleanup_hash text NOT NULL UNIQUE,
  access_expires_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE devices (
  session_id uuid PRIMARY KEY REFERENCES service_sessions(id) ON DELETE CASCADE,
  push_token text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE registrations (
  id uuid PRIMARY KEY,
  instance_id text NOT NULL,
  project_id bigint NOT NULL,
  mode text NOT NULL CHECK (mode IN ('legacy', 'signed')),
  encrypted_secret text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE(instance_id, project_id)
);
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES service_sessions(id) ON DELETE CASCADE,
  project_id bigint NOT NULL,
  lease_until timestamptz NOT NULL,
  preferences jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE(session_id, project_id)
);
CREATE TABLE events (
  id uuid PRIMARY KEY,
  registration_id uuid NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  resource text NOT NULL,
  resource_id bigint NOT NULL,
  dedup_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);
CREATE TABLE outbox (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','receipt','done','dropped','dead')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ticket_id text,
  locked_until timestamptz,
  UNIQUE(event_id, subscription_id)
);
CREATE INDEX outbox_due ON outbox(next_attempt_at) WHERE state IN ('pending', 'receipt');
CREATE INDEX subscriptions_project ON subscriptions(project_id, session_id) WHERE active;
