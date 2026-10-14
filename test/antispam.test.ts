import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSubmission, issueFormToken } from '../src/security/antispam.js';

const S = 'secret-de-test';

test('soumission normale acceptée', () => {
  const t = issueFormToken(S, 1_000_000);
  assert.equal(checkSubmission(S, t, '', 1_000_000 + 10_000), 'ok');
});

test('champ piège rempli → refus', () => {
  const t = issueFormToken(S, 0);
  assert.equal(checkSubmission(S, t, 'http://spam', 10_000), 'honeypot');
});

test('trop rapide → refus', () => {
  const t = issueFormToken(S, 1_000_000);
  assert.equal(checkSubmission(S, t, '', 1_000_500), 'too-fast');
});

test('jeton falsifié ou absent → refus', () => {
  assert.equal(checkSubmission(S, undefined, '', 0), 'bad-token');
  assert.equal(checkSubmission(S, '0.abc', '', 10_000), 'bad-token');
  const t = issueFormToken('autre-secret', 0);
  assert.equal(checkSubmission(S, t, '', 10_000), 'bad-token');
});

test('jeton expiré → refus', () => {
  const t = issueFormToken(S, 0);
  assert.equal(checkSubmission(S, t, '', 2 * 24 * 3600 * 1000), 'expired');
});

import { createLimiter } from '../src/security/ratelimit.js';

test('limitation de débit par IP', () => {
  const allow = createLimiter(2, 1000);
  assert.equal(allow('1.2.3.4', 0), true);
  assert.equal(allow('1.2.3.4', 10), true);
  assert.equal(allow('1.2.3.4', 20), false);
  assert.equal(allow('5.6.7.8', 20), true);
  assert.equal(allow('1.2.3.4', 1500), true);
});
