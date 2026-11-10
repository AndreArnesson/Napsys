export interface AnalysisCalculationSettings {
  targetPE: number;
  qGrowthMode: 'yoy' | 'sequential';
}

export function analysisPeriod(date?: string) {
  const parsed = date ? new Date(date) : new Date();
  const value = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  return { year: value.getUTCFullYear(), quarter: Math.floor(value.getUTCMonth() / 3) + 1 };
}

export function calculationSettings(value: unknown): AnalysisCalculationSettings {
  const saved = value as Partial<AnalysisCalculationSettings> | null;
  return {
    targetPE: typeof saved?.targetPE === 'number' && Number.isFinite(saved.targetPE) && saved.targetPE >= 0 ? saved.targetPE : 15,
    qGrowthMode: saved?.qGrowthMode === 'sequential' ? 'sequential' : 'yoy',
  };
}
