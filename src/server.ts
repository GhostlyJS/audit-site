import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import formbody from '@fastify/formbody';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import * as store from './db.js';
import { startWorker, wakeWorker } from './worker.js';
import { notifyLead } from './mailer.js';
import { cacheKey, UrlError, validateUrl } from './security/url.js';
import { checkSubmission, HONEYPOT_FIELD, issueFormToken } from './security/antispam.js';
import { createLimiter } from './security/ratelimit.js';
import { layout } from './views/layout.js';
import * as pages from './views/pages.js';
import type { Safe } from './views/html.js';

const app = Fastify({ trustProxy: true, bodyLimit: 32 * 1024, logger: { level: 'warn' } });
await app.register(formbody);

const analyseLimiter = createLimiter(config.rateLimit.analysesPerHour, 3600_000);
const leadLimiter = createLimiter(config.rateLimit.leadsPerHour, 3600_000);

declare module 'fastify' {
  interface FastifyRequest {
    nonce: string;
  }
}
app.decorateRequest('nonce', '');
app.addHook('onRequest', async (req) => {
  req.nonce = randomBytes(16).toString('base64');
});
app.addHook('onSend', async (req, reply) => {
  reply.header(
    'Content-Security-Policy',
    `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${req.nonce}'; img-src data:; connect-src 'self'; form-action 'self' mailto:; base-uri 'none'; frame-ancestors 'none'`,
  );
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('Permissions-Policy', 'interest-cohort=()');
});

type Opts = { status?: number; noindex?: boolean; script?: string };
function send(req: FastifyRequest, reply: FastifyReply, title: string, body: Safe, o: Opts = {}) {
  return reply
    .status(o.status ?? 200)
    .type('text/html; charset=utf-8')
    .send(layout({ title, body, nonce: req.nonce, noindex: o.noindex, script: o.script }));
}

function baseUrl(req: FastifyRequest): string {
  return config.publicUrl || `${req.protocol}://${req.host}`;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function parseVisits(v: unknown): number | null {
  const s = str(v, 20).replace(/[\s.  ]/g, '');
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= 100_000_000 ? n : null;
}

// ---------- Accueil et lancement d'une analyse ----------

app.get('/', (req, reply) => send(req, reply, 'Votre site vous fait-il perdre des clients ?', pages.homePage({})));

app.post('/analyser', async (req, reply) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const rawUrl = str(body.url, 2000);
  const visits = parseVisits(body.visits);
  const force = body.force === '1';
  const fail = (error: string, status = 400) =>
    send(req, reply, 'Analyser votre site', pages.homePage({ error, url: rawUrl, visits: visits?.toString() }), { status });

  let url: URL;
  try {
    url = await validateUrl(rawUrl);
  } catch (e) {
    if (e instanceof UrlError) return fail(e.message);
    throw e;
  }
  const key = cacheKey(url);

  if (!force) {
    const cached = store.findCached(key, Date.now() - config.cacheHours * 3600_000);
    if (cached) return reply.redirect(`/rapport/${store.insertFromCache(cached, visits)}`, 303);
  }
  const pending = store.findPending(key, visits);
  if (pending) return reply.redirect(`/rapport/${pending.id}`, 303);

  if (!analyseLimiter(req.ip)) {
    return fail('Vous avez lancé beaucoup d’analyses en peu de temps. Merci de réessayer dans une heure.', 429);
  }
  if (store.queueCount() >= config.queue.maxQueued) {
    return fail('Beaucoup de demandes en ce moment. Merci de réessayer dans quelques minutes.', 503);
  }
  const id = store.insertQueued(url.href, key, visits);
  wakeWorker();
  return reply.redirect(`/rapport/${id}`, 303);
});

// ---------- Rapports ----------

const ID_RE = /^[A-Za-z0-9_-]{16}$/;

function loadReport(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  const r = ID_RE.test(id) ? store.getReport(id) : undefined;
  if (!r) {
    send(req, reply, 'Rapport introuvable', pages.simplePage('Rapport introuvable', 'Ce rapport n’existe pas ou a expiré. Les rapports sont conservés ' + config.retentionDays + ' jours.'), { status: 404, noindex: true });
    return null;
  }
  return r;
}

app.get('/rapport/:id', (req, reply) => {
  const r = loadReport(req, reply);
  if (!r) return reply;
  if (r.status === 'queued' || r.status === 'running') {
    return send(req, reply, 'Analyse en cours', pages.waitingPage(r, store.queuePosition(r)), { noindex: true, script: pages.waitingScript(r.id) });
  }
  if (r.status === 'error') return send(req, reply, 'Analyse impossible', pages.analysisErrorPage(r), { noindex: true });
  const res = store.parseResult(r)!;
  return send(req, reply, 'Résultat de votre analyse', pages.resultPage(r, res, `${baseUrl(req)}/rapport/${r.id}/technique`), { noindex: true, script: pages.copyScript });
});

app.get('/rapport/:id/statut', (req, reply) => {
  const r = loadReport(req, reply);
  if (!r) return reply;
  const position = r.status === 'queued' || r.status === 'running' ? store.queuePosition(r) : 0;
  return reply.header('Cache-Control', 'no-store').send({ status: r.status, position, text: pages.queueText(position) });
});

app.get('/rapport/:id/technique', (req, reply) => {
  const r = loadReport(req, reply);
  if (!r) return reply;
  if (r.status !== 'done') return reply.redirect(`/rapport/${r.id}`);
  return send(req, reply, 'Rapport technique', pages.technicalPage(r, store.parseResult(r)!, `/rapport/${r.id}`), { noindex: true, script: pages.printScript });
});

// ---------- Contact (lead) ----------

function reportFromParam(v: unknown) {
  const id = str(v, 32);
  return ID_RE.test(id) ? store.getReport(id) : undefined;
}

app.get('/contact', (req, reply) => {
  const report = reportFromParam((req.query as Record<string, unknown>).rapport);
  return send(req, reply, 'Contact', pages.contactPage({ report, values: {}, errors: [], token: issueFormToken(config.formSecret) }), { noindex: !!report });
});

app.post('/contact', async (req, reply) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const report = reportFromParam(b.rapport);
  const values = { name: str(b.name, 100), email: str(b.email, 200), phone: str(b.phone, 30), message: str(b.message, 3000) };
  const errors: string[] = [];
  const retry = (status: number) =>
    send(req, reply, 'Contact', pages.contactPage({ report, values, errors, token: issueFormToken(config.formSecret) }), { status, noindex: true });

  const verdict = checkSubmission(config.formSecret, str(b.jeton, 200), str(b[HONEYPOT_FIELD], 500));
  if (verdict === 'honeypot') return reply.redirect('/merci', 303); // on ne signale rien au robot
  if (verdict !== 'ok') {
    errors.push(verdict === 'too-fast' ? 'Merci de vérifier vos informations puis de renvoyer le formulaire.' : 'Le formulaire a expiré, merci de le renvoyer.');
    return retry(400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) errors.push('Merci d’indiquer une adresse email valide.');
  if (b.consent !== '1') errors.push('Merci de cocher la case de consentement pour que nous puissions vous recontacter.');
  if (errors.length) return retry(400);
  if (!leadLimiter(req.ip)) {
    errors.push('Trop de demandes envoyées depuis votre connexion. Merci de réessayer plus tard ou d’écrire directement par email.');
    return retry(429);
  }

  const leadId = store.insertLead({
    report_id: report?.id ?? null,
    name: values.name,
    email: values.email,
    phone: values.phone || null,
    message: values.message || null,
    consent_at: Date.now(),
  });
  const base = baseUrl(req);
  const text = [
    `Nouvelle demande de contact (${config.brand.name})`,
    '',
    `Nom : ${values.name || '–'}`,
    `Email : ${values.email}`,
    `Téléphone : ${values.phone || '–'}`,
    `Site analysé : ${report?.url ?? '–'}`,
    report ? `Résultat : ${base}/rapport/${report.id}\nRapport technique : ${base}/rapport/${report.id}/technique` : '',
    '',
    'Message :',
    values.message || '–',
    '',
    `Toutes les demandes : ${base}/admin`,
  ].join('\n');
  const subject = `Nouveau contact${report ? ` : ${new URL(report.url).hostname}` : ''}`.replace(/[\r\n]/g, ' ');
  notifyLead(subject, text, values.email).then((ok) => ok && store.markNotified(leadId));
  return reply.redirect(report ? `/merci?rapport=${report.id}` : '/merci', 303);
});

app.get('/merci', (req, reply) => {
  const r = reportFromParam((req.query as Record<string, unknown>).rapport);
  return send(req, reply, 'Merci', pages.thanksPage(r?.id), { noindex: true });
});

// ---------- Pages annexes ----------

app.get('/methode', (req, reply) => send(req, reply, 'Comment c’est calculé ?', pages.methodPage()));
app.get('/mentions-legales', (req, reply) => send(req, reply, 'Mentions légales', pages.legalPage()));
app.get('/confidentialite', (req, reply) => send(req, reply, 'Politique de confidentialité', pages.privacyPage()));
app.get('/robots.txt', (_req, reply) =>
  reply.type('text/plain').send('User-agent: *\nDisallow: /rapport/\nDisallow: /admin\nDisallow: /contact\n'),
);
app.get('/healthz', () => ({ ok: true }));

// ---------- Administration (authentification HTTP basique) ----------

function adminAuth(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!config.admin.pass) {
    reply.status(404).send('Administration désactivée : définissez ADMIN_PASSWORD.');
    return false;
  }
  const expected = Buffer.from(`${config.admin.user}:${config.admin.pass}`);
  const given = Buffer.from(
    Buffer.from((req.headers.authorization ?? '').replace(/^Basic /, ''), 'base64').toString(),
  );
  if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  reply.status(401).header('WWW-Authenticate', 'Basic realm="admin", charset="UTF-8"').send('Authentification requise');
  return false;
}

app.get('/admin', (req, reply) => {
  if (!adminAuth(req, reply)) return reply;
  return send(req, reply, 'Administration', pages.adminPage(store.listLeads()), { noindex: true });
});

app.get('/admin/leads.csv', (req, reply) => {
  if (!adminAuth(req, reply)) return reply;
  const base = baseUrl(req);
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise les formules dans les tableurs
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = [['date', 'nom', 'email', 'telephone', 'message', 'site', 'rapport', 'notifie']].concat(
    store.listLeads().map((l) => [
      new Date(l.created_at).toISOString(), l.name, l.email, l.phone ?? '', l.message ?? '', l.url ?? '',
      l.report_id ? `${base}/rapport/${l.report_id}` : '', l.notified ? 'oui' : 'non',
    ]),
  );
  return reply
    .type('text/csv; charset=utf-8')
    .header('Content-Disposition', 'attachment; filename="leads.csv"')
    .send('﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n'));
});

app.setNotFoundHandler((req, reply) =>
  send(req, reply, 'Page introuvable', pages.simplePage('Page introuvable', 'Cette page n’existe pas.'), { status: 404 }),
);
app.setErrorHandler((err, req, reply) => {
  req.log.error(err);
  return send(req, reply, 'Erreur', pages.simplePage('Une erreur est survenue', 'Merci de réessayer dans un instant.'), { status: 500 });
});

// ---------- Démarrage ----------

startWorker();
const purge = () => {
  const n = store.purgeOldReports(config.retentionDays);
  if (n) console.log(`[purge] ${n} rapport(s) supprimé(s)`);
};
purge();
setInterval(purge, 3600_000).unref();

await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`${config.brand.name} prêt sur le port ${config.port}`);
