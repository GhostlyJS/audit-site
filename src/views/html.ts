// Gabarits HTML minimalistes : toute valeur interpolée est échappée, sauf si marquée raw().
export class Safe {
  constructor(readonly value: string) {}
  toString() {
    return this.value;
  }
}

export const raw = (s: string) => new Safe(s);

export function esc(v: unknown): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(v: unknown): string {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Safe) return v.value;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Safe {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Safe(out);
}

// Description Lighthouse (Markdown limité) → HTML sûr : liens http(s) et `code`.
export function lhMarkdown(md: string): Safe {
  let s = esc(md);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, text, url) => `<a href="${url}" rel="noopener noreferrer">${text}</a>`);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  return raw(s);
}

const nf = new Intl.NumberFormat('fr-FR');
export const num = (n: number) => nf.format(n);
export const num1 = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n);
export const pct = (share: number) => `${Math.round(share * 100)} %`;
export const dateFr = (ms: number) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(ms);
