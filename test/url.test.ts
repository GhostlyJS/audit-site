import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheKey, isPublicIp, normalizeUrl, UrlError, validateUrl } from '../src/security/url.js';

test('normalisation : ajoute https, retire le fragment', () => {
  assert.equal(normalizeUrl('exemple.fr').href, 'https://exemple.fr/');
  assert.equal(normalizeUrl('  http://exemple.fr/a#b ').href, 'http://exemple.fr/a');
});

test('refuse les schémas, ports et noms non publics', () => {
  for (const bad of [
    '', 'ftp://exemple.fr', 'file:///etc/passwd', 'javascript:alert(1)', 'http://localhost',
    'http://intranet', 'http://serveur.local', 'http://exemple.fr:22', 'http://user:pw@exemple.fr',
    'http://127.0.0.1', 'http://10.0.0.1', 'http://192.168.1.1', 'http://169.254.169.254',
    'http://[::1]', 'http://[fd00::1]', 'http://[::ffff:127.0.0.1]', 'http://0.0.0.0',
    'http://2130706433', 'http://0x7f000001',
  ]) {
    assert.throws(() => normalizeUrl(bad), UrlError, bad);
  }
});

test('isPublicIp', () => {
  assert.equal(isPublicIp('8.8.8.8'), true);
  assert.equal(isPublicIp('2a00:1450:4007::1'), true);
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.17.0.2', '192.168.0.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', 'fe80::1', 'fc00::1',
    '::ffff:10.0.0.1', '::', 'pas-une-ip']) {
    assert.equal(isPublicIp(ip), false, ip);
  }
});

test('résolution DNS : refuse si une adresse est privée (y compris rebinding mixte)', async () => {
  const ok = await validateUrl('exemple.fr', async () => ['93.184.216.34']);
  assert.equal(ok.hostname, 'exemple.fr');
  await assert.rejects(validateUrl('evil.fr', async () => ['127.0.0.1']), UrlError);
  await assert.rejects(validateUrl('evil.fr', async () => ['93.184.216.34', '10.0.0.1']), UrlError);
  await assert.rejects(validateUrl('evil.fr', async () => { throw new Error('ENOTFOUND'); }), UrlError);
});

test('clé de cache', () => {
  assert.equal(cacheKey(normalizeUrl('Exemple.FR/')), 'https://exemple.fr/');
  assert.equal(cacheKey(normalizeUrl('exemple.fr/page/')), 'https://exemple.fr/page');
});
