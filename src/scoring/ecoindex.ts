// Calcul EcoIndex réimplémenté d'après la méthode publique décrite par le collectif
// GreenIT.fr (https://www.ecoindex.fr/comment-ca-marche/) et les quantiles publiés
// dans le référentiel cnumr/ecoindex. Seule la formule (non protégeable) est reprise.

import { SCORING } from './config.js';

const QUANTILES_DOM = [
  0, 47, 75, 159, 233, 298, 358, 417, 476, 537, 603, 674, 753, 843, 949, 1076, 1237, 1459, 1801,
  2479, 594601,
];
const QUANTILES_REQ = [
  0, 2, 15, 25, 34, 42, 49, 56, 63, 70, 78, 86, 95, 105, 117, 130, 147, 170, 205, 281, 3920,
];
const QUANTILES_SIZE = [
  0, 1.37, 144.7, 319.53, 479.46, 631.97, 783.38, 937.91, 1098.62, 1265.47, 1448.32, 1648.27,
  1876.08, 2142.06, 2465.37, 2866.31, 3401.59, 4155.73, 5400.08, 8037.54, 223212.26,
];

export function quantile(quantiles: number[], value: number): number {
  for (let i = 1; i < quantiles.length; i++) {
    if (value < quantiles[i]) {
      return i - 1 + (value - quantiles[i - 1]) / (quantiles[i] - quantiles[i - 1]);
    }
  }
  return quantiles.length - 1;
}

export interface EcoIndexInput {
  domElements: number;
  requests: number;
  sizeKb: number;
}

export interface EcoIndexResult {
  score: number;
  grade: string;
  ghgGrams: number;
  waterCl: number;
}

export function gradeFor(score: number): string {
  for (const [letter, min] of SCORING.gradeThresholds) {
    if (score > min) return letter;
  }
  return 'G';
}

export function computeEcoIndex({ domElements, requests, sizeKb }: EcoIndexInput): EcoIndexResult {
  const qDom = quantile(QUANTILES_DOM, domElements);
  const qReq = quantile(QUANTILES_REQ, requests);
  const qSize = quantile(QUANTILES_SIZE, sizeKb);
  const score = Math.max(0, Math.min(100, 100 - (5 * (3 * qDom + 2 * qReq + qSize)) / 6));
  return {
    score: round(score, 2),
    grade: gradeFor(score),
    ghgGrams: round(2 + (2 * (50 - score)) / 100, 2),
    waterCl: round(3 + (3 * (50 - score)) / 100, 2),
  };
}

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
