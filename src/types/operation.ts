export type AppTab = 'painel' | 'scanner' | 'cadastrar' | 'mapa' | 'relatorios';

export type FleetStatus = 'aguardando' | 'embarcada';

export interface GridPosition {
  row: number; // 0 = Bombordo extremo ... rows-1 = Boreste extremo
  col: number; // 0 = Proa (Frente) ... cols-1 = Popa (Rampa)
}

export interface FleetRecord {
  id: string;
  unidadeDestino: string;
  veiculo: string;
  chassiIdentificador: string;
  descricaoCarga: string;
  pesoCargaKg: number;
  pesoTotalKg: number;
  bls: string;
  em: string;
  status: FleetStatus;
  waveNumber: number;
  registeredAt: string;
  boardedAt?: string;
  mapPosition?: GridPosition | null;
  isPinned?: boolean;
}

export interface PendingManifestFleet {
  tempId: string;
  unidadeDestino: string;
  veiculo: string;
  chassiIdentificador: string;
  descricaoCarga: string;
  pesoCargaKg: number;
  pesoTotalKg: number;
  bls: string;
  em: string;
  checked: boolean;
}

export type ScanOutcome = 'autorizada' | 'nao_cadastrada' | 'rejeitada_leitura';

export interface ScanLogEntry {
  id: string;
  scannedCode: string;
  matchedFleetId?: string;
  outcome: ScanOutcome;
  method: 'ia_camera' | 'manual';
  timestamp: string;
  note: string;
}

export type TrimPreference = 'neutro' | 'popa_leve' | 'proa_leve';

export interface BargeSpecs {
  name: string;
  blsCode: string;
  emCode: string;
  route: string;
  rows: number;
  cols: number;
  maxCapacityTons: number;
  riverCondition: string;
  trimPreference: TrimPreference;
  specialNotes: string;
}

export type WeightTier = 'pesado' | 'medio' | 'leve' | 'restrito';

export interface IndicativeZoneCell {
  row: number;
  col: number;
  tier: WeightTier;
  recommendedMinTons: number;
  recommendedMaxTons: number;
  rationale: string;
}

export type BalanceStatus = 'equilibrada' | 'atencao' | 'critico';

export interface BalanceAnalysis {
  placedCount: number;
  boardedCount: number;
  totalWeightKg: number;
  maxCapacityKg: number;
  utilizationPct: number;
  bowWeightKg: number;
  sternWeightKg: number;
  portWeightKg: number;
  starboardWeightKg: number;
  cgX: number; // -1 (Proa) to +1 (Popa/Rampa)
  cgY: number; // -1 (Bombordo) to +1 (Boreste)
  longitudinalImbalancePct: number; // 0..100
  transversalImbalancePct: number; // 0..100
  status: BalanceStatus;
  criticalFleetIds: string[];
  recommendations: string[];
}

export type OccurrencePhase = 'embarque' | 'desembarque';
export type OccurrenceSeverity = 'informativo' | 'atencao' | 'critico';

export interface OccurrenceRecord {
  id: string;
  timestamp: string;
  phase: OccurrencePhase;
  severity: OccurrenceSeverity;
  title: string;
  description: string;
  fleetCode?: string;
  photoDataUrl?: string;
}

export interface AiExecutiveReport {
  generatedAt: string;
  resumoExecutivo: string;
  parecerEstabilidade: string;
  pontosAtencao: string[];
  recomendacaoViagem: string;
}
