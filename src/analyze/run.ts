// Processus enfant : analyse une URL et écrit le résultat JSON dans le fichier indiqué.
// Usage : node dist/analyze/run.js <url> <fichier-sortie>
// Lancé dans un processus séparé pour pouvoir être tué proprement en cas de dépassement.
import { writeFileSync } from 'node:fs';
import lighthouse from 'lighthouse';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { startGuardProxy } from './proxy.js';
import { computeEcoIndex } from '../scoring/ecoindex.js';
import type { AnalysisResult, AuditItem } from './types.js';

const [, , url, outFile] = process.argv;

// Titres des pages de vérification anti-robot (Cloudflare, etc.) : la mesure serait faussée.
const CHALLENGE = /^(just a moment|attention required|checking your browser|un instant|vérification)/i;

async function measureEcoIndex(browser: Browser, target: string) {
  // Protocole EcoIndex : fenêtre 1920×1080, cache désactivé, défilement jusqu'en bas.
  const page: Page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  // Sans la mention « Headless », sinon certains pare-feu servent une page de vérification.
  await page.setUserAgent((await browser.userAgent()).replace('HeadlessChrome', 'Chrome'));
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  let bytes = 0;
  let requests = 0;
  cdp.on('Network.loadingFinished', (e) => {
    bytes += e.encodedDataLength;
    requests++;
  });
  try {
    await page.goto(target, { waitUntil: 'networkidle2', timeout: 20000 });
  } catch {
    // Page jamais « calme » (flux continus) : on mesure ce qui a été chargé.
  }
  await page.evaluate(() => window.scrollTo(0, document.body?.scrollHeight ?? 0)).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));
  const domElements = await page.evaluate(
    () => document.getElementsByTagName('*').length - document.querySelectorAll('svg *').length,
  );
  const title = await page.title().catch(() => '');
  await page.close();
  if (CHALLENGE.test(title)) throw new Error('BOT_PROTECTION');
  const sizeKb = bytes / 1024;
  return { ...computeEcoIndex({ domElements, requests, sizeKb }), domElements, requests, sizeKb: Math.round(sizeKb) };
}

async function greenCheck(host: string): Promise<AnalysisResult['greenHosting']> {
  try {
    const res = await fetch(
      `https://api.thegreenwebfoundation.org/api/v3/greencheck/${encodeURIComponent(host)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { green?: boolean; hosted_by?: string };
    return { green: !!j.green, hostedBy: j.hosted_by || null };
  } catch {
    return null;
  }
}

function urlsOf(details: any): string[] {
  const out: string[] = [];
  const walk = (d: any) => {
    if (!d || out.length >= 5) return;
    if (Array.isArray(d.items)) {
      for (const it of d.items) {
        if (out.length >= 5) break;
        if (typeof it?.url === 'string' && /^https?:/.test(it.url)) out.push(it.url);
        else if (it && typeof it === 'object' && it.type) walk(it);
      }
    }
  };
  walk(details);
  return [...new Set(out)];
}

function toItem(a: any): AuditItem {
  const d = a.details ?? {};
  const savingsMs = d.overallSavingsMs ?? a.metricSavings?.LCP ?? a.metricSavings?.FCP ?? 0;
  return {
    id: a.id,
    title: a.title,
    description: a.description ?? '',
    displayValue: a.displayValue,
    savingsMs: Math.round(savingsMs || 0),
    savingsBytes: Math.round(d.overallSavingsBytes ?? 0),
    urls: urlsOf(d),
  };
}

const T0 = Date.now();
const lap = (s: string) => process.stderr.write(`[${Math.round((Date.now() - T0) / 1000)} s] ${s}\n`);
async function main() {
  const proxy = await startGuardProxy();
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-quic',
      '--no-first-run',
      '--disable-extensions',
      '--disable-background-networking',
      `--proxy-server=http://127.0.0.1:${proxy.port}`,
      '--proxy-bypass-list=<-loopback>',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    ],
  });
  try {
    lap('navigateur prêt');
    const eco = await measureEcoIndex(browser, url);
    lap('EcoIndex mesuré');
    const page = await browser.newPage();
    const run = await lighthouse(
      url,
      { logLevel: 'error', output: 'json', onlyCategories: ['performance', 'seo'], locale: 'fr', maxWaitForLoad: 35000 },
      undefined,
      page as any,
    );
    lap('Lighthouse terminé');
    if (!run) throw new Error('Lighthouse n’a rien renvoyé');
    const lhr = run.lhr;
    if (lhr.runtimeError) throw new Error(`LH:${lhr.runtimeError.code}`);
    // La page reste sur l'URL analysée après Lighthouse : on vérifie qu'il ne s'agit pas d'un contrôle anti-robot.
    if (CHALLENGE.test(await page.title().catch(() => ''))) throw new Error('BOT_PROTECTION');
    const audits = lhr.audits as Record<string, any>;
    const perf = lhr.categories.performance;
    const seo = lhr.categories.seo;
    if (perf.score === null || seo.score === null) throw new Error('LH:NO_SCORE');

    const opportunities = perf.auditRefs
      .filter((r) => r.group === 'insights' || r.group === 'diagnostics')
      .map((r) => audits[r.id])
      .filter((a) => a && a.score !== null && a.score < 0.9 && !['manual', 'notApplicable', 'informative', 'error'].includes(a.scoreDisplayMode))
      .map(toItem)
      .sort((a, b) => b.savingsMs - a.savingsMs || b.savingsBytes - a.savingsBytes);
    const seoFailures = seo.auditRefs
      .filter((r) => r.weight > 0)
      .map((r) => audits[r.id])
      .filter((a) => a && a.score === 0 && a.scoreDisplayMode === 'binary')
      .map(toItem);

    const finalUrl = lhr.finalDisplayedUrl || url;
    const result: AnalysisResult = {
      requestedUrl: url,
      finalUrl,
      analyzedAt: Date.now(),
      lighthouseVersion: lhr.lighthouseVersion,
      performance: Math.round(perf.score * 100),
      seo: Math.round(seo.score * 100),
      metrics: {
        lcpMs: Math.round(audits['largest-contentful-paint']?.numericValue ?? 0),
        cls: Number((audits['cumulative-layout-shift']?.numericValue ?? 0).toFixed(3)),
        tbtMs: Math.round(audits['total-blocking-time']?.numericValue ?? 0),
        fcpMs: Math.round(audits['first-contentful-paint']?.numericValue ?? 0),
        siMs: Math.round(audits['speed-index']?.numericValue ?? 0),
      },
      ecoindex: eco,
      greenHosting: await greenCheck(new URL(finalUrl).hostname),
      opportunities,
      seoFailures,
      blockedHosts: proxy.blocked,
    };
    writeFileSync(outFile, JSON.stringify(result));
  } finally {
    await browser.close().catch(() => {});
    await proxy.close();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    process.stderr.write(String(err?.stack ?? err) + '\n');
    writeFileSync(outFile, JSON.stringify({ error: String(err?.message ?? err) }));
    process.exit(1);
  },
);
