import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { startGuardProxy } from '../src/analyze/proxy.js';

// Le mandataire doit refuser toute destination non publique, même via un nom de domaine.
test('mandataire : refuse HTTP et CONNECT vers une IP interne', async () => {
  const proxy = await startGuardProxy(async (h) => (h === 'interne.test' ? ['127.0.0.1'] : ['10.0.0.5']));
  try {
    const status = await new Promise<number>((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', port: proxy.port, path: 'http://interne.test/secret' }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        })
        .on('error', reject);
    });
    assert.equal(status, 403);

    const line = await new Promise<string>((resolve) => {
      const s = net.connect(proxy.port, '127.0.0.1', () => s.write('CONNECT 169.254.169.254:443 HTTP/1.1\r\n\r\n'));
      s.once('data', (d) => { resolve(d.toString().split('\r\n')[0]); s.destroy(); });
    });
    assert.match(line, /403/);
    assert.deepEqual(proxy.blocked, ['interne.test', '169.254.169.254']);
  } finally {
    await proxy.close();
  }
});
