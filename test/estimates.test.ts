import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bounceIncrease,
  coreWebVitals,
  estimateCo2,
  estimateLostVisitors,
  seoProblemCount,
} from '../src/scoring/estimates.js';

test('courbe de rebond : points publiés et interpolation', () => {
  assert.equal(bounceIncrease(1), 0);
  assert.equal(bounceIncrease(3), 0.32);
  assert.ok(Math.abs(bounceIncrease(5) - 0.9) < 1e-9);
  assert.ok(Math.abs(bounceIncrease(2) - 0.16) < 1e-9);
  assert.equal(bounceIncrease(30), 1.23);
});

test('site rapide → message positif, aucun visiteur perdu', () => {
  const r = estimateLostVisitors(1800, 5000);
  assert.equal(r.fast, true);
  assert.equal(r.visitsLow, 0);
});

test('site lent avec visiteurs connus → fourchette en nombre', () => {
  const r = estimateLostVisitors(6000, 1000);
  // extra = 1.06 - 0.24 = 0.82 → 12,3 % à 20,5 %
  assert.equal(r.fast, false);
  assert.ok(Math.abs(r.shareLow - 0.123) < 1e-9);
  assert.ok(Math.abs(r.shareHigh - 0.205) < 1e-9);
  assert.equal(r.visitsLow, 123);
  assert.equal(r.visitsHigh, 205);
});

test('visiteurs inconnus → pourcentage seulement', () => {
  const r = estimateLostVisitors(8000, null);
  assert.equal(r.visitsLow, null);
  assert.ok(r.shareLow > 0);
});

test('CO₂ annuel et équivalent voiture', () => {
  const r = estimateCo2(2, 1000);
  assert.equal(r.assumed, false);
  assert.equal(r.kgPerYear, 24);
  assert.equal(r.carKm, 110);
  const d = estimateCo2(2, null);
  assert.equal(d.assumed, true);
  assert.equal(d.monthlyVisits, 1000);
});

test('Core Web Vitals et compte des problèmes de référencement', () => {
  const cwv = coreWebVitals(4000, 0.05, 600);
  assert.deepEqual(cwv, { lcpOk: false, clsOk: true, tbtOk: false, allOk: false });
  assert.equal(seoProblemCount(2, cwv), 4);
  assert.equal(coreWebVitals(2000, 0.01, 50).allOk, true);
});
