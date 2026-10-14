export interface AuditItem {
  id: string;
  title: string;
  description: string;
  displayValue?: string;
  savingsMs: number;
  savingsBytes: number;
  urls: string[];
}

export interface AnalysisResult {
  requestedUrl: string;
  finalUrl: string;
  analyzedAt: number;
  lighthouseVersion: string;
  performance: number; // 0–100
  seo: number; // 0–100
  metrics: { lcpMs: number; cls: number; tbtMs: number; fcpMs: number; siMs: number };
  ecoindex: {
    score: number;
    grade: string;
    ghgGrams: number;
    waterCl: number;
    domElements: number;
    requests: number;
    sizeKb: number;
  };
  greenHosting: { green: boolean; hostedBy: string | null } | null;
  opportunities: AuditItem[]; // performance, triées par gain estimé
  seoFailures: AuditItem[];
  blockedHosts: string[];
}
