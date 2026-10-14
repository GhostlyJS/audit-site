// Configuration lue depuis l'environnement (fichier .env via Docker Compose).
import { randomBytes } from 'node:crypto';

const env = process.env;
const int = (v: string | undefined, d: number) => (v && /^\d+$/.test(v) ? Number(v) : d);

export const config = {
  port: int(env.APP_PORT, 3000),
  publicUrl: (env.PUBLIC_URL || (env.DOMAIN ? `https://${env.DOMAIN}` : '')).replace(/\/+$/, ''),
  dataDir: env.DATA_DIR || './data',

  brand: {
    name: env.BRAND_NAME || 'Audit Site Sobre',
    ownerName: env.OWNER_NAME || '[Votre nom]',
    ownerBio:
      env.OWNER_BIO ||
      'Développeur web indépendant, j’aide les PME à avoir des sites rapides, bien référencés et sobres.',
    ownerUrl: env.OWNER_URL || '',
  },

  smtp: {
    host: env.SMTP_HOST || '',
    port: int(env.SMTP_PORT, 587),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || env.SMTP_USER || '',
  },
  notifyEmail: env.NOTIFY_EMAIL || '',

  admin: { user: env.ADMIN_USER || 'admin', pass: env.ADMIN_PASSWORD || '' },
  // Secret de signature des formulaires ; aléatoire à chaque démarrage s'il n'est pas fourni.
  formSecret: env.FORM_SECRET || randomBytes(32).toString('hex'),

  queue: {
    concurrency: Math.max(1, int(env.QUEUE_CONCURRENCY, 1)),
    timeoutSec: Math.max(30, int(env.ANALYSIS_TIMEOUT_SECONDS, 90)),
    maxQueued: int(env.QUEUE_MAX, 30),
  },
  cacheHours: int(env.CACHE_HOURS, 24),
  retentionDays: int(env.RETENTION_DAYS, 90),
  rateLimit: {
    analysesPerHour: int(env.RATE_ANALYSES_PER_HOUR, 10),
    leadsPerHour: int(env.RATE_LEADS_PER_HOUR, 5),
  },
};
