// File d'attente : prend les analyses en attente une par une (concurrence configurable)
// et les exécute dans un processus enfant tué en cas de dépassement de durée.
import { spawn } from 'node:child_process';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, type ReportRow } from './db.js';
import { config } from './config.js';

const runner = join(dirname(fileURLToPath(import.meta.url)), 'analyze', 'run.js');
let running = 0;

const claim = db.transaction((): ReportRow | undefined => {
  const next = db
    .prepare(`SELECT * FROM reports WHERE status = 'queued' ORDER BY created_at, id LIMIT 1`)
    .get() as ReportRow | undefined;
  if (next) db.prepare(`UPDATE reports SET status = 'running', started_at = ? WHERE id = ?`).run(Date.now(), next.id);
  return next;
});

function finish(id: string, result: string | null, error: string | null) {
  db.prepare(`UPDATE reports SET status = ?, result = ?, error = ?, finished_at = ? WHERE id = ?`).run(
    error ? 'error' : 'done',
    result,
    error,
    Date.now(),
    id,
  );
}

function analyze(report: ReportRow): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'audit-'));
  const out = join(dir, 'result.json');
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [runner, report.url, out], {
      detached: true, // groupe de processus dédié : on peut tuer Chromium avec
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-4000)));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {}
    }, config.queue.timeoutSec * 1000);
    child.on('exit', () => {
      clearTimeout(timer);
      try {
        process.kill(-child.pid!, 'SIGKILL'); // nettoie d'éventuels processus Chromium orphelins
      } catch {}
      let content: string | null = null;
      try {
        content = readFileSync(out, 'utf8');
      } catch {}
      rmSync(dir, { recursive: true, force: true });
      if (timedOut) {
        console.error(`[analyse ${report.id}] délai dépassé, étapes :\n${stderr}`);
        finish(report.id, null, 'TIMEOUT');
      } else if (!content) {
        console.error(`[analyse ${report.id}] échec sans résultat\n${stderr}`);
        finish(report.id, null, 'CRASH');
      } else {
        const parsed = JSON.parse(content);
        if (parsed.error) {
          console.error(`[analyse ${report.id}] ${parsed.error}`);
          finish(report.id, null, String(parsed.error).slice(0, 500));
        } else {
          finish(report.id, content, null);
        }
      }
      console.log(`[analyse ${report.id}] ${report.url} terminée${timedOut ? ' (délai dépassé)' : ''}`);
      resolve();
    });
  });
}

function tick() {
  while (running < config.queue.concurrency) {
    const next = claim();
    if (!next) return;
    running++;
    analyze(next).finally(() => {
      running--;
      tick();
    });
  }
}

export function startWorker() {
  // Après un redémarrage, les analyses interrompues repartent en file.
  db.prepare(`UPDATE reports SET status = 'queued', started_at = NULL WHERE status = 'running'`).run();
  setInterval(tick, 1000).unref();
  tick();
}

export const wakeWorker = () => setImmediate(tick);
