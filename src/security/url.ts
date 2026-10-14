// Validation des adresses saisies et protection contre le SSRF.
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export class UrlError extends Error {}

const ALLOWED_PORTS = new Set(['', '80', '443']);

// Une IP est acceptée seulement si elle est publique (« unicast » au sens d'ipaddr.js) :
// cela exclut privé, bouclage, link-local (dont 169.254.169.254, métadonnées cloud),
// CGNAT, multicast, réservé, ULA IPv6, etc.
export function isPublicIp(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  let addr = ipaddr.parse(ip);
  if (addr.kind() === 'ipv6') {
    const v6 = addr as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) addr = v6.toIPv4Address();
  }
  if (addr.range() !== 'unicast') return false;
  if (addr.kind() === 'ipv6') {
    // Seul l'espace unicast global (2000::/3) est routable sur Internet.
    return addr.match(ipaddr.IPv6.parse('2000::'), 3);
  }
  return true;
}

// Normalise une saisie libre en URL http(s) sans fragment ni identifiants.
export function normalizeUrl(input: string): URL {
  let raw = (input ?? '').trim();
  if (!raw) throw new UrlError('Veuillez saisir l’adresse de votre site.');
  if (raw.length > 2000) throw new UrlError('Cette adresse est trop longue.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'https://' + raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlError('Cette adresse ne semble pas valide. Exemple : monentreprise.fr');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlError('Seules les adresses de sites web (http ou https) sont acceptées.');
  }
  if (url.username || url.password) throw new UrlError('Cette adresse ne peut pas être analysée.');
  if (!ALLOWED_PORTS.has(url.port)) throw new UrlError('Cette adresse ne peut pas être analysée.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (ipaddr.isValid(host)) {
    if (!isPublicIp(host)) throw new UrlError('Cette adresse ne peut pas être analysée.');
  } else {
    // Exige un vrai nom de domaine public (au moins un point, TLD alphabétique).
    if (!/^([a-z0-9-]+\.)+[a-z][a-z0-9-]*\.?$/i.test(host) || /\.(local|localhost|internal|lan|home|corp|intranet)\.?$/i.test(host)) {
      throw new UrlError('Cette adresse ne semble pas être un site public.');
    }
  }
  url.hash = '';
  return url;
}

export type Resolver = (host: string) => Promise<string[]>;

export const systemResolver: Resolver = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

// Résout le nom et refuse si UNE des adresses n'est pas publique.
export async function resolvePublic(host: string, resolve: Resolver = systemResolver): Promise<string[]> {
  const bare = host.replace(/^\[|\]$/g, '');
  if (ipaddr.isValid(bare)) {
    if (!isPublicIp(bare)) throw new UrlError('Cette adresse ne peut pas être analysée.');
    return [bare];
  }
  let addrs: string[];
  try {
    addrs = await resolve(bare);
  } catch {
    throw new UrlError('Ce site est introuvable. Vérifiez l’adresse.');
  }
  if (addrs.length === 0) throw new UrlError('Ce site est introuvable. Vérifiez l’adresse.');
  if (!addrs.every(isPublicIp)) throw new UrlError('Cette adresse ne peut pas être analysée.');
  return addrs;
}

export async function validateUrl(input: string, resolve: Resolver = systemResolver): Promise<URL> {
  const url = normalizeUrl(input);
  await resolvePublic(url.hostname, resolve);
  return url;
}

// Clé de cache : même site, même chemin, sans slash final ni « www » ambigu conservé.
export function cacheKey(url: URL): string {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  return `${url.protocol}//${url.hostname.toLowerCase()}${path}${url.search}`;
}
