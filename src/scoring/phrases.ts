// Traduction des audits Lighthouse en phrases simples pour le patron.
// Les audits absents de cette table n'apparaissent que dans le rapport technique.
import type { AuditItem } from '../analyze/types.js';

interface Phrase {
  text: string;
  timed?: boolean; // ajoute le temps perdu estimé quand il est connu
  weight?: number; // priorité fixe (en « ms équivalentes ») pour les problèmes sans gain mesuré
}

const PERF: Record<string, Phrase> = {
  'image-delivery-insight': { text: 'Vos images sont trop lourdes pour les téléphones', timed: true },
  'render-blocking-insight': { text: 'Des fichiers empêchent votre page de s’afficher tout de suite : vos visiteurs regardent un écran blanc', timed: true },
  'document-latency-insight': { text: 'Votre serveur met trop de temps à répondre', timed: true },
  'server-response-time': { text: 'Votre serveur met trop de temps à répondre', timed: true },
  'unused-javascript': { text: 'Votre site charge du code qui ne sert à rien sur cette page', timed: true },
  'unused-css-rules': { text: 'Votre site charge des mises en forme inutilisées', timed: true },
  'unminified-javascript': { text: 'Les fichiers de votre site ne sont pas allégés comme ils devraient l’être', timed: true },
  'unminified-css': { text: 'Les fichiers de votre site ne sont pas allégés comme ils devraient l’être', timed: true },
  'lcp-discovery-insight': { text: 'L’élément principal de votre page (souvent la grande image) se charge trop tard', timed: true, weight: 300 },
  'third-parties-insight': { text: 'Des services extérieurs (publicités, statistiques, widgets) ralentissent votre page', timed: true, weight: 250 },
  'font-display-insight': { text: 'Le texte de votre page reste invisible le temps que les polices se chargent', timed: true, weight: 150 },
  'cls-culprits-insight': { text: 'Votre page « saute » pendant le chargement : vos visiteurs risquent de cliquer au mauvais endroit', weight: 400 },
  'unsized-images': { text: 'Des images n’ont pas de place réservée : la page bouge pendant le chargement', weight: 200 },
  'cache-insight': { text: 'Votre site oblige vos visiteurs réguliers à tout retélécharger à chaque visite', weight: 200 },
  'legacy-javascript-insight': { text: 'Votre site envoie du code ancien et inutilement lourd', timed: true, weight: 100 },
  'duplicated-javascript-insight': { text: 'Le même code est chargé plusieurs fois', timed: true, weight: 100 },
  'modern-http-insight': { text: 'Votre hébergement utilise une technologie de transfert dépassée', timed: true, weight: 150 },
  'bootup-time': { text: 'Votre page fait trop travailler le téléphone de vos visiteurs : elle réagit mal aux premiers clics', weight: 350 },
  'mainthread-work-breakdown': { text: 'Votre page fait trop travailler le téléphone de vos visiteurs : elle réagit mal aux premiers clics', weight: 300 },
  'total-byte-weight': { text: 'Votre page est très lourde : longue à charger en 4G et gourmande en énergie', weight: 300 },
  'redirects': { text: 'Votre adresse fait des détours avant d’afficher la page', timed: true },
  'dom-size-insight': { text: 'Votre page est construite de façon trop complexe, ce qui la ralentit sur téléphone', weight: 150 },
  'viewport-insight': { text: 'Votre page n’est pas correctement adaptée aux téléphones', weight: 900 },
};

const SEO: Record<string, Phrase> = {
  'is-crawlable': { text: 'Votre page est réglée pour NE PAS apparaître sur Google', weight: 100000 },
  'http-status-code': { text: 'Votre page renvoie une erreur : Google risque de l’ignorer', weight: 100000 },
  'document-title': { text: 'Votre page n’a pas de titre : Google ne sait pas comment la présenter', weight: 900 },
  'meta-description': { text: 'Votre page n’a pas de description : Google affiche un extrait pris au hasard sous votre lien', weight: 800 },
  'canonical': { text: 'Votre page indique à Google une mauvaise adresse « officielle »', weight: 700 },
  'robots-txt': { text: 'Le fichier qui guide Google sur votre site contient des erreurs', weight: 600 },
  'crawlable-anchors': { text: 'Certains liens de votre page ne peuvent pas être suivis par Google', weight: 400 },
  'link-text': { text: 'Certains liens disent juste « cliquez ici » : Google ne comprend pas où ils mènent', weight: 300 },
  'image-alt': { text: 'Vos images n’ont pas de description : Google ne sait pas ce qu’elles montrent', weight: 300 },
  'hreflang': { text: 'Les versions en différentes langues de votre site sont mal déclarées', weight: 300 },
};

export function formatSeconds(ms: number): string {
  const s = ms / 1000;
  return (s >= 10 ? Math.round(s).toString() : s.toFixed(1).replace('.', ',')) + ' s';
}

export interface OwnerIssue {
  text: string;
  kind: 'speed' | 'google';
}

// Les 3 problèmes les plus coûteux, en phrases simples, sans doublon.
export function topOwnerIssues(opportunities: AuditItem[], seoFailures: AuditItem[], max = 3): OwnerIssue[] {
  const candidates: { cost: number; issue: OwnerIssue }[] = [];
  for (const a of opportunities) {
    const p = PERF[a.id];
    if (!p) continue;
    const timed = p.timed && a.savingsMs >= 200;
    const text = timed
      ? `${p.text}. Environ ${formatSeconds(a.savingsMs)} de perdues à l’affichage sur mobile.`
      : `${p.text}.`;
    candidates.push({ cost: Math.max(a.savingsMs, p.weight ?? 0), issue: { text, kind: 'speed' } });
  }
  for (const a of seoFailures) {
    const p = SEO[a.id];
    if (p) candidates.push({ cost: p.weight ?? 0, issue: { text: `${p.text}.`, kind: 'google' } });
  }
  candidates.sort((a, b) => b.cost - a.cost);
  const seen = new Set<string>();
  const out: OwnerIssue[] = [];
  for (const c of candidates) {
    const base = c.issue.text.split('.')[0];
    if (seen.has(base)) continue;
    seen.add(base);
    out.push(c.issue);
    if (out.length === max) break;
  }
  return out;
}
