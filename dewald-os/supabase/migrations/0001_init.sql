-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- Enums
CREATE TYPE entity_kind  AS ENUM ('company', 'person', 'project');
CREATE TYPE task_urgency AS ENUM ('today', 'this_week', 'this_month', 'someday');

-- ─────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────

CREATE TABLE entities (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid,
  name       text        NOT NULL,
  kind       entity_kind NOT NULL,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE companies (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  name        text        NOT NULL,
  role        text,
  color_token text,
  is_primary  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE raw_captures (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid,
  source         text,
  raw_text       text,
  audio_url      text,
  classification jsonb,
  llm_source     text,
  routed_to      text,
  routed_id      uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid,
  company_id        uuid        REFERENCES companies (id) ON DELETE SET NULL,
  title             text        NOT NULL,
  description       text,
  urgency           task_urgency,
  key               boolean     NOT NULL DEFAULT false,
  priority_score    numeric,
  time_estimate_min integer,
  tags              text[],
  due_date          date,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid,
  company_id uuid        REFERENCES companies (id) ON DELETE SET NULL,
  name       text        NOT NULL,
  focus      text,
  status     text,
  tags       text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE daily_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid,
  log_date   date        NOT NULL,
  notes      jsonb,
  mood       smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memory_chunks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  source_type text,
  source_id   uuid,
  text        text,
  embedding   vector(1536),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid,
  action        text        NOT NULL,
  resource_type text,
  resource_id   uuid,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- Seed data
-- ─────────────────────────────────────────

INSERT INTO companies (name, role, color_token, is_primary) VALUES
  ('Micasa Energy Solutions', 'ops_director', 'accent', true),
  ('Gesondt Pty Ltd',         'ceo',          'cool',   false),
  ('Canned Drinks Co',        'founder',      'warm',   false),
  ('GFC Engineering',         'owner',        'hot',    false);

-- ─────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────

-- ivfflat approximate cosine-similarity search on embeddings
CREATE INDEX memory_chunks_embedding_idx
  ON memory_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─────────────────────────────────────────
-- Row Level Security (deny-all by default;
-- service_role bypasses RLS automatically)
-- ─────────────────────────────────────────

ALTER TABLE entities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_captures  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log     ENABLE ROW LEVEL SECURITY;
