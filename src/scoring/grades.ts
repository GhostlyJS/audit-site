import { SCORING } from './config.js';
import { gradeFor } from './ecoindex.js';

export type Color = 'good' | 'medium' | 'bad';

export interface Grades {
  speed: number;
  visibility: number;
  planet: number;
  overall: number;
  overallGrade: string;
}

export function colorFor(score: number): Color {
  if (score >= SCORING.colorThresholds.good) return 'good';
  if (score >= SCORING.colorThresholds.medium) return 'medium';
  return 'bad';
}

export function gradeColor(grade: string): Color {
  if (grade === 'A' || grade === 'B') return 'good';
  if (grade === 'C' || grade === 'D') return 'medium';
  return 'bad';
}

function weighted(parts: [number, number][]): number {
  const totalWeight = parts.reduce((s, [, w]) => s + w, 0);
  return parts.reduce((s, [v, w]) => s + v * w, 0) / totalWeight;
}

export function computeGrades(performance: number, seo: number, ecoindex: number): Grades {
  const vw = SCORING.visibilityWeights;
  const ow = SCORING.overallWeights;
  const speed = Math.round(performance);
  const visibility = Math.round(weighted([[seo, vw.seo], [performance, vw.performance]]));
  const planet = Math.round(ecoindex);
  const overall = weighted([[speed, ow.speed], [visibility, ow.visibility], [planet, ow.planet]]);
  return { speed, visibility, planet, overall: Math.round(overall), overallGrade: gradeFor(overall) };
}
