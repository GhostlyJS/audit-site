import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeEcoIndex, gradeFor, quantile } from '../src/scoring/ecoindex.js';
import { computeGrades, colorFor, gradeColor } from '../src/scoring/grades.js';

test('quantile interpole entre deux bornes et plafonne', () => {
  assert.equal(quantile([0, 10, 20], 5), 0.5);
  assert.equal(quantile([0, 10, 20], 15), 1.5);
  assert.equal(quantile([0, 10, 20], 999), 2);
});

test('EcoIndex : page minuscule ≈ 100 / A, page énorme ≈ 0 / G', () => {
  const small = computeEcoIndex({ domElements: 1, requests: 1, sizeKb: 1 });
  assert.ok(small.score > 95);
  assert.equal(small.grade, 'A');
  const huge = computeEcoIndex({ domElements: 600000, requests: 5000, sizeKb: 300000 });
  assert.equal(huge.score, 0);
  assert.equal(huge.grade, 'G');
  assert.equal(huge.ghgGrams, 3);
  assert.equal(huge.waterCl, 4.5);
});

test('EcoIndex : valeur de référence (page médiane)', () => {
  // Médianes du jeu de quantiles → q = 10 pour chacune → score = 100 - 5*60/6 = 50
  const r = computeEcoIndex({ domElements: 603, requests: 78, sizeKb: 1448.32 });
  assert.equal(r.score, 50);
  assert.equal(r.grade, 'D');
  assert.equal(r.ghgGrams, 2);
  assert.equal(r.waterCl, 3);
});

test('seuils de lettre (strictement supérieur)', () => {
  assert.equal(gradeFor(80.01), 'A');
  assert.equal(gradeFor(80), 'B');
  assert.equal(gradeFor(70), 'C');
  assert.equal(gradeFor(55), 'D');
  assert.equal(gradeFor(40), 'E');
  assert.equal(gradeFor(25), 'F');
  assert.equal(gradeFor(10), 'G');
  assert.equal(gradeFor(0), 'G');
});

test('notes : visibilité = moyenne SEO/perf, globale = moyenne des jauges', () => {
  const g = computeGrades(40, 90, 70);
  assert.equal(g.speed, 40);
  assert.equal(g.visibility, 65);
  assert.equal(g.planet, 70);
  assert.equal(g.overall, 58);
  assert.equal(g.overallGrade, 'C'); // 58,3 > 55
  assert.equal(computeGrades(100, 100, 100).overallGrade, 'A');
});

test('couleurs cohérentes', () => {
  assert.equal(colorFor(90), 'good');
  assert.equal(colorFor(60), 'medium');
  assert.equal(colorFor(20), 'bad');
  assert.equal(gradeColor('A'), 'good');
  assert.equal(gradeColor('D'), 'medium');
  assert.equal(gradeColor('G'), 'bad');
});

import { topOwnerIssues, formatSeconds } from '../src/scoring/phrases.js';

test('phrases patron : 3 problèmes max, triés par coût, sans jargon ni doublon', () => {
  const item = (id: string, savingsMs = 0) => ({ id, title: id, description: '', savingsMs, savingsBytes: 0, urls: [] });
  const issues = topOwnerIssues(
    [item('image-delivery-insight', 3200), item('unused-javascript', 600), item('unminified-css', 50),
     item('unminified-javascript', 900), item('audit-inconnu', 9999)],
    [item('meta-description'), item('is-crawlable')],
  );
  assert.equal(issues.length, 3);
  assert.match(issues[0].text, /NE PAS apparaître/);
  assert.match(issues[1].text, /images.*3,2 s/);
  assert.match(issues[2].text, /allégés.*\. Environ 0,9 s/); // unminified-css dédoublonné
  assert.equal(formatSeconds(12400), '12 s');
});
