import { ESTIMATES, SCORING } from './config.js';

// Hausse relative du rebond pour un temps de chargement donné (interpolation linéaire).
export function bounceIncrease(seconds: number): number {
  const c = ESTIMATES.bounceCurve;
  if (seconds <= c[0][0]) return 0;
  for (let i = 1; i < c.length; i++) {
    if (seconds <= c[i][0]) {
      const [x0, y0] = c[i - 1];
      const [x1, y1] = c[i];
      return y0 + ((seconds - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return c[c.length - 1][1]; // au-delà de 10 s, plafonné (prudent)
}

export interface LostVisitors {
  fast: boolean;
  shareLow: number; // part de visiteurs perdus (0–1), estimation basse
  shareHigh: number;
  visitsLow: number | null; // null si le nombre de visiteurs est inconnu
  visitsHigh: number | null;
}

export function estimateLostVisitors(lcpMs: number, monthlyVisits: number | null): LostVisitors {
  const extra = Math.max(
    0,
    bounceIncrease(lcpMs / 1000) - bounceIncrease(ESTIMATES.referenceSeconds),
  );
  const shareLow = extra * ESTIMATES.baseBounce.low;
  const shareHigh = extra * ESTIMATES.baseBounce.high;
  const fast = shareHigh < ESTIMATES.negligibleShare;
  const visits = monthlyVisits && monthlyVisits > 0 ? monthlyVisits : null;
  return {
    fast,
    shareLow,
    shareHigh,
    visitsLow: visits === null ? null : Math.round(visits * shareLow),
    visitsHigh: visits === null ? null : Math.round(visits * shareHigh),
  };
}

export interface Co2Estimate {
  monthlyVisits: number;
  assumed: boolean; // true si l'hypothèse par défaut a été utilisée
  kgPerYear: number;
  carKm: number;
}

export function estimateCo2(gramsPerVisit: number, monthlyVisits: number | null): Co2Estimate {
  const assumed = !(monthlyVisits && monthlyVisits > 0);
  const visits = assumed ? ESTIMATES.defaultMonthlyVisits : (monthlyVisits as number);
  const grams = gramsPerVisit * visits * 12;
  return {
    monthlyVisits: visits,
    assumed,
    kgPerYear: grams / 1000,
    carKm: Math.round(grams / ESTIMATES.carGramsPerKm),
  };
}

export interface CwvStatus {
  lcpOk: boolean;
  clsOk: boolean;
  tbtOk: boolean;
  allOk: boolean;
}

export function coreWebVitals(lcpMs: number, cls: number, tbtMs: number): CwvStatus {
  const t = SCORING.coreWebVitals;
  const lcpOk = lcpMs <= t.lcpMs;
  const clsOk = cls <= t.cls;
  const tbtOk = tbtMs <= t.tbtMs;
  return { lcpOk, clsOk, tbtOk, allOk: lcpOk && clsOk && tbtOk };
}

// Nombre de problèmes vérifiables qui pénalisent le référencement :
// audits SEO en échec + critères Core Web Vitals non atteints.
export function seoProblemCount(failedSeoAudits: number, cwv: CwvStatus): number {
  return failedSeoAudits + [cwv.lcpOk, cwv.clsOk, cwv.tbtOk].filter((ok) => !ok).length;
}
