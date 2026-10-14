// Mandataire HTTP local imposé à Chromium : chaque requête (page, sous-ressources,
// redirections, websockets) est résolue ici et refusée si la destination n'est pas
// une IP publique. La connexion est ouverte vers l'IP vérifiée (pas de DNS rebinding).
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { resolvePublic, type Resolver, systemResolver } from '../security/url.js';

export interface GuardProxy {
  port: number;
  blocked: string[];
  close(): Promise<void>;
}

export async function startGuardProxy(resolve: Resolver = systemResolver): Promise<GuardProxy> {
  const blocked: string[] = [];

  async function safeAddress(host: string): Promise<string | null> {
    try {
      const [ip] = await resolvePublic(host, resolve);
      return ip;
    } catch {
      if (blocked.length < 50) blocked.push(host);
      return null;
    }
  }

  const server = http.createServer(async (req, res) => {
    let target: URL;
    try {
      target = new URL(req.url ?? '');
      if (target.protocol !== 'http:') throw new Error('protocole');
    } catch {
      res.writeHead(400).end();
      return;
    }
    const ip = await safeAddress(target.hostname);
    if (!ip) {
      res.writeHead(403).end('Destination refusée');
      return;
    }
    const upstream = http.request(
      {
        host: ip,
        port: target.port || 80,
        method: req.method,
        path: target.pathname + target.search,
        headers: { ...req.headers, host: target.host },
        setHost: false,
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', () => res.headersSent ? res.destroy() : res.writeHead(502).end());
    req.pipe(upstream);
  });

  server.on('connect', async (req, client: net.Socket, head) => {
    client.on('error', () => client.destroy());
    const m = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(req.url ?? '');
    const ip = m ? await safeAddress(m[1]) : null;
    if (!m || !ip) {
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const upstream = net.connect(Number(m[2]), ip, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => client.destroy());
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    port: (server.address() as AddressInfo).port,
    blocked,
    close: () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}
