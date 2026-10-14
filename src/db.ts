import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from './config.js';
import type { AnalysisResult } from './analyze/types.js';

mkdirSync(config.dataDir, { recursive: true });
export const db = new Database(join(config.dataDir, 'audit.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  monthly_visits INTEGER,
  status TEXT NOT NULL CHECK (status IN ('queued','running','done','error')),
  error TEXT,
  result TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS reports_cache ON reports (cache_key, status, finished_at);
CREATE INDEX IF NOT EXISTS reports_queue ON reports (status, created_at);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id TEXT REFERENCES reports(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  consent_at INTEGER NOT NULL,
  notified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
`);

export interface ReportRow {
  id: string;
  url: string;
  cache_key: string;
  monthly_visits: number | null;
  status: 'queued' | 'running' | 'done' | 'error';
  error: string | null;
  result: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
}

export interface LeadRow {
  id: number;
  report_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  consent_at: number;
  notified: number;
  created_at: number;
}

export const newId = () => randomBytes(12).toString('base64url');

export function getReport(id: string): ReportRow | undefined {
  return db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as ReportRow | undefined;
}

export function parseResult(r: ReportRow): AnalysisResult | null {
  return r.result ? (JSON.parse(r.result) as AnalysisResult) : null;
}

export function findCached(cacheKey: string, sinceMs: number): ReportRow | undefined {
  return db
    .prepare(
      `SELECT * FROM reports WHERE cache_key = ? AND status = 'done' AND finished_at >= ?
       ORDER BY finished_at DESC LIMIT 1`,
    )
    .get(cacheKey, sinceMs) as ReportRow | undefined;
}

export function findPending(cacheKey: string, visits: number | null): ReportRow | undefined {
  return db
    .prepare(
      `SELECT * FROM reports WHERE cache_key = ? AND status IN ('queued','running')
       AND monthly_visits IS ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(cacheKey, visits) as ReportRow | undefined;
}

export function insertQueued(url: string, cacheKey: string, visits: number | null): string {
  const id = newId();
  db.prepare(
    `INSERT INTO reports (id, url, cache_key, monthly_visits, status, created_at)
     VALUES (?, ?, ?, ?, 'queued', ?)`,
  ).run(id, url, cacheKey, visits, Date.now());
  return id;
}

// Réutilise un résultat récent sous un nouvel identifiant (le nombre de visiteurs peut différer).
export function insertFromCache(src: ReportRow, visits: number | null): string {
  const id = newId();
  db.prepare(
    `INSERT INTO reports (id, url, cache_key, monthly_visits, status, result, created_at, started_at, finished_at)
     VALUES (?, ?, ?, ?, 'done', ?, ?, ?, ?)`,
  ).run(id, src.url, src.cache_key, visits, src.result, Date.now(), src.started_at, src.finished_at);
  return id;
}

export function queueCount(): number {
  return (db.prepare(`SELECT COUNT(*) n FROM reports WHERE status IN ('queued','running')`).get() as { n: number }).n;
}

// Nombre d'analyses à traiter avant celle-ci (en cours + en attente plus anciennes).
export function queuePosition(r: ReportRow): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) n FROM reports WHERE status = 'running'
         OR (status = 'queued' AND (created_at < ? OR (created_at = ? AND id < ?)))`,
      )
      .get(r.created_at, r.created_at, r.id) as { n: number }
  ).n;
}

export function insertLead(l: Omit<LeadRow, 'id' | 'notified' | 'created_at'>): number {
  return Number(
    db
      .prepare(
        `INSERT INTO leads (report_id, name, email, phone, message, consent_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(l.report_id, l.name, l.email, l.phone, l.message, l.consent_at, Date.now()).lastInsertRowid,
  );
}

export function markNotified(id: number) {
  db.prepare('UPDATE leads SET notified = 1 WHERE id = ?').run(id);
}

export function listLeads(): (LeadRow & { url: string | null })[] {
  return db
    .prepare(
      `SELECT leads.*, reports.url AS url FROM leads LEFT JOIN reports ON reports.id = leads.report_id
       ORDER BY leads.created_at DESC`,
    )
    .all() as (LeadRow & { url: string | null })[];
}

// Supprime les rapports anciens qui ne sont rattachés à aucun lead.
export function purgeOldReports(retentionDays: number): number {
  const cutoff = Date.now() - retentionDays * 86400_000;
  return db
    .prepare(
      `DELETE FROM reports WHERE created_at < ?
       AND id NOT IN (SELECT report_id FROM leads WHERE report_id IS NOT NULL)`,
    )
    .run(cutoff).changes;
}
