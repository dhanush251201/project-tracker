import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

export const DEFAULT_DB_PATH = resolve(ROOT, 'data', 'tracker.db');

let db = null;

/** Open (or reopen) the database and make sure the schema is present. */
export function openDb(path = process.env.TRACKER_DB || DEFAULT_DB_PATH) {
  if (db) db.close();
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

export function getDb() {
  if (!db) openDb();
  return db;
}

export function closeDb() {
  if (db) db.close();
  db = null;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS teams (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT    NOT NULL,
  course              TEXT    DEFAULT '',
  semester            TEXT    DEFAULT '',
  project_title       TEXT    DEFAULT '',
  project_description TEXT    DEFAULT '',
  tech_stack          TEXT    DEFAULT '',
  repo_url            TEXT    DEFAULT '',
  demo_url            TEXT    DEFAULT '',
  doc_url             TEXT    DEFAULT '',
  meeting_schedule    TEXT    DEFAULT '',
  status              TEXT    NOT NULL DEFAULT 'active',
  health              TEXT    NOT NULL DEFAULT 'unknown',
  color               TEXT    DEFAULT '#6366f1',
  archived            INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT    NOT NULL,
  updated_at          TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  email       TEXT    DEFAULT '',
  role        TEXT    DEFAULT '',
  github      TEXT    DEFAULT '',
  pennkey     TEXT    DEFAULT '',
  notes       TEXT    DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_members_team ON members(team_id);

CREATE TABLE IF NOT EXISTS meetings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id       INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  date          TEXT    NOT NULL,
  title         TEXT    DEFAULT '',
  kind          TEXT    NOT NULL DEFAULT 'weekly',
  duration_min  INTEGER DEFAULT 30,
  agenda        TEXT    DEFAULT '',
  notes         TEXT    DEFAULT '',
  decisions     TEXT    DEFAULT '',
  blockers      TEXT    DEFAULT '',
  private_notes TEXT    DEFAULT '',
  mood          TEXT    DEFAULT '',
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meetings_team ON meetings(team_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);

CREATE TABLE IF NOT EXISTS attendance (
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status     TEXT    NOT NULL DEFAULT 'present',
  PRIMARY KEY (meeting_id, member_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id      INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  meeting_id   INTEGER REFERENCES meetings(id) ON DELETE SET NULL,
  member_id    INTEGER REFERENCES members(id) ON DELETE SET NULL,
  title        TEXT    NOT NULL,
  description  TEXT    DEFAULT '',
  owner        TEXT    NOT NULL DEFAULT 'team',
  status       TEXT    NOT NULL DEFAULT 'todo',
  priority     TEXT    NOT NULL DEFAULT 'normal',
  due_date     TEXT    DEFAULT NULL,
  completed_at TEXT    DEFAULT NULL,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

CREATE TABLE IF NOT EXISTS milestones (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id      INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  description  TEXT    DEFAULT '',
  due_date     TEXT    DEFAULT NULL,
  status       TEXT    NOT NULL DEFAULT 'pending',
  weight       INTEGER NOT NULL DEFAULT 1,
  order_index  INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT    DEFAULT NULL,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_milestones_team ON milestones(team_id);

CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id    INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  member_id  INTEGER REFERENCES members(id) ON DELETE CASCADE,
  title      TEXT    DEFAULT '',
  body       TEXT    DEFAULT '',
  kind       TEXT    NOT NULL DEFAULT 'thought',
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_team ON notes(team_id);
CREATE INDEX IF NOT EXISTS idx_notes_member ON notes(member_id);

CREATE TABLE IF NOT EXISTS tags (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#64748b'
);

CREATE TABLE IF NOT EXISTS tag_links (
  tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  entity_type TEXT    NOT NULL,
  entity_id   INTEGER NOT NULL,
  PRIMARY KEY (tag_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_taglinks_entity ON tag_links(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function migrate(database) {
  database.exec(SCHEMA);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function now() {
  return new Date().toISOString();
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** node:sqlite returns null-prototype objects; normalise to plain objects. */
export function plain(row) {
  return row ? { ...row } : row;
}

export function plainAll(rows) {
  return rows.map((r) => ({ ...r }));
}

/** Build `UPDATE` SET clauses from an allow-list of columns. */
export function buildUpdate(table, id, fields, allowed) {
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (keys.length === 0) return null;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k]);
  return {
    sql: `UPDATE ${table} SET ${sets}, updated_at = ? WHERE id = ?`,
    values: [...values, now(), id],
  };
}
