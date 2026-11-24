import React, { useMemo, useState } from 'react';
import {
  Scale,
  Pin,
  PinOff,
  Lock,
  Unlock,
  AlertTriangle,
  Sparkles,
  Settings2,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  X,
  RotateCcw,
} from 'lucide-react';
import type {
  BalanceAnalysis,
  BargeSpecs,
  FleetRecord,
  GridPosition,
  IndicativeZoneCell,
  TrimPreference,
} from '../types/operation';
import { formatWeightTons } from '../utils/balanceEngine';

interface CriacaoMapaProps {
  specs: BargeSpecs;
  fleets: FleetRecord[];
  balance: BalanceAnalysis;
  indicativeMap: IndicativeZoneCell[];
  indicativeGuidelines: string[];
  onUpdateSpecs: (next: BargeSpecs) => void;
  onUpdateIndicativeMap: (cells: IndicativeZoneCell[], guidelines: string[]) => void;
  onMoveFleet: (fleetId: string, target: GridPosition | null, forceOverride?: boolean) => void;
  onTogglePin: (fleetId: string) => void;
  onOptimize: () => void;
}

const LANE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

export const CriacaoMapa: React.FC<CriacaoMapaProps> = ({
  specs,
  fleets,
  balance,
  indicativeMap,
  indicativeGuidelines,
  onUpdateSpecs,
  onUpdateIndicativeMap,
  onMoveFleet,
  onTogglePin,
  onOptimize,
}) => {
  const [selectedFleetId, setSelectedFleetId] = useState<string | null>(null);
  const [draggedFleetId, setDraggedFleetId] = useState<string | null>(null);
  const [showIndicative, setShowIndicative] = useState(true);
  const [showSpecsPanel, setShowSpecsPanel] = useState(false);
  const [unlockedCriticalIds, setUnlockedCriticalIds] = useState<string[]>([]);

  const [specsDraft, setSpecsDraft] = useState<BargeSpecs>(specs);
  const [aiLoading, setAiLoading] = useState<'indicative' | 'advisory' | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAdvisory, setAiAdvisory] = useState<{
    diagnostico: string;
    acoesRecomendadas: string[];
    alertaCritico: string;
  } | null>(null);

  const slotLookup = useMemo(() => {
    const map = new Map<string, FleetRecord>();
    for (const f of fleets) {
      if (f.mapPosition) {
        map.set(`${f.mapPosition.row}:${f.mapPosition.col}`, f);
      }
    }
    return map;
  }, [fleets]);

  const indicativeLookup = useMemo(() => {
    const map = new Map<string, IndicativeZoneCell>();
    for (const c of indicativeMap) {
      map.set(`${c.row}:${c.col}`, c);
    }
    return map;
  }, [indicativeMap]);

  const unplacedFleets = useMemo(
    () => fleets.filter((f) => !f.mapPosition),
    [fleets],
  );

  const criticalSet = useMemo(
    () => new Set(balance.criticalFleetIds),
    [balance.criticalFleetIds],
  );

  const selectedFleet = useMemo(
    () => fleets.find((f) => f.id === selectedFleetId) ?? null,
    [fleets, selectedFleetId],
  );

  const canMoveFleet = (fleet: FleetRecord): boolean => {
    if (fleet.status !== 'embarcada') return true;
    return balance.status === 'critico' && unlockedCriticalIds.includes(fleet.id);
  };

  const handleSlotClick = (row: number, col: number) => {
    const occupant = slotLookup.get(`${row}:${col}`);

    if (selectedFleetId) {
      const moving = fleets.find((f) => f.id === selectedFleetId);
      if (!moving) {
        setSelectedFleetId(null);
        return;
      }

      // Clicking the same fleet toggles selection off
      if (occupant && occupant.id === moving.id) {
        setSelectedFleetId(null);
        return;
      }

      if (!canMoveFleet(moving)) {
        setSelectedFleetId(null);
        return;
      }

      // If target slot has a locked/boarded fleet, select that fleet instead
      if (occupant && !canMoveFleet(occupant)) {
        setSelectedFleetId(occupant.id);
        return;
      }

      onMoveFleet(moving.id, { row, col }, unlockedCriticalIds.includes(moving.id));
      setSelectedFleetId(null);
      return;
    }

    if (occupant) {
      setSelectedFleetId(occupant.id);
    }
  };

  const handleDropOnSlot = (e: React.DragEvent, row: number, col: number) => {
    e.preventDefault();
    const fid = e.dataTransfer.getData('text/plain') || draggedFleetId;
    setDraggedFleetId(null);
    if (!fid) return;
    const moving = fleets.find((f) => f.id === fid);
    if (!moving || !canMoveFleet(moving)) return;
    const occupant = slotLookup.get(`${row}:${col}`);
    if (occupant && !canMoveFleet(occupant)) return;
    onMoveFleet(moving.id, { row, col }, unlockedCriticalIds.includes(moving.id));
    setSelectedFleetId(null);
  };

  const handleGenerateAiIndicativeMap = async () => {
    setAiLoading('indicative');
    setAiError(null);
    onUpdateSpecs(specsDraft);
    try {
      const totalWeightTons = fleets.reduce((acc, f) => acc + f.pesoTotalKg, 0) / 1000;
      const response = await fetch('/api/ai/indicative-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specs: specsDraft,
          fleetsSummary: {
            totalFleets: fleets.length,
            boardedCount: fleets.filter((f) => f.status === 'embarcada').length,
            totalWeightTons: Number(totalWeightTons.toFixed(1)),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao gerar mapa prévio indicativo com IA.');
      }
      if (Array.isArray(data.cells) && data.cells.length > 0) {
        onUpdateIndicativeMap(data.cells, data.guidelines ?? []);
        setShowIndicative(true);
      }
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Não foi possível gerar o mapa indicativo com IA.',
      );
    } finally {
      setAiLoading(null);
    }
  };

  const handleRunAiAdvisory = async () => {
    setAiLoading('advisory');
    setAiError(null);
    try {
      const response = await fetch('/api/ai/analyze-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specs,
          balance,
          fleets: fleets.map((f) => ({
            placa: f.chassiIdentificador,
            pesoT: Number((f.pesoTotalKg / 1000).toFixed(1)),
            status: f.status,
            fixada: Boolean(f.isPinned),
            posicao: f.mapPosition
              ? `${LANE_LETTERS[f.mapPosition.row]}${f.mapPosition.col + 1}`
              : 'pendente',
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao consultar sugestão da IA.');
      }
      setAiAdvisory(data);
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Falha ao gerar recomendação inteligente de estivagem.',
      );
    } finally {
      setAiLoading(null);
    }
  };

  const tierStyle = (tier?: IndicativeZoneCell['tier']) => {
    switch (tier) {
      case 'pesado':
        return 'bg-sky-100/80 border-sky-300 text-sky-900';
      case 'medio':
        return 'bg-teal-50/80 border-teal-200 text-teal-900';
      case 'leve':
        return 'bg-slate-50 border-slate-200 text-slate-600';
      case 'restrito':
        return 'bg-amber-50/80 border-amber-300 text-amber-900';
      default:
        return 'bg-slate-50 border-slate-200 text-slate-500';
    }
  };

  const cgLeftPct = Math.max(6, Math.min(94, ((balance.cgX + 1) / 2) * 100));
  const cgTopPct = Math.max(8, Math.min(92, ((balance.cgY + 1) / 2) * 100));

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="max-w-xl">
          <h1 className="text-2xl font-extrabold text-slate-900">Criação de Mapa</h1>
          <p className="text-sm text-slate-600 mt-1">
            Arraste ou clique nas carretas para estivar na balsa, fixe posições obrigatórias e
            equilibre automaticamente a cada nova leva.
          </p>
        </div>

        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowIndicative((v) => !v)}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-800 hover:bg-slate-50 min-h-[44px] whitespace-nowrap cursor-pointer"
          >
            {showIndicative ? (
              <EyeOff className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Eye className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{showIndicative ? 'Ocultar Zonas IA' : 'Exibir Mapa Prévio'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSpecsDraft(specs);
              setShowSpecsPanel((v) => !v);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-800 hover:bg-slate-50 min-h-[44px] whitespace-nowrap cursor-pointer"
          >
            <Settings2 className="w-4 h-4" aria-hidden="true" />
            <span>Características da Balsa</span>
          </button>

          <button
            type="button"
            disabled={aiLoading !== null}
            onClick={handleRunAiAdvisory}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F5B7C] hover:bg-[#0c4a66] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold min-h-[44px] whitespace-nowrap cursor-pointer"
          >
            {aiLoading === 'advisory' ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="w-4 h-4" aria-hidden="true" />
            )}
            <span>Analisar com IA</span>
          </button>
        </div>
      </div>

      {/* Live Stability Telemetry Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Status de Equilíbrio</p>
          <div className="mt-1 flex items-center gap-2">
            {balance.status === 'critico' ? (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
            ) : balance.status === 'atencao' ? (
              <Scale className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
            )}
            <span
              className={`text-base font-extrabold ${
                balance.status === 'critico'
                  ? 'text-red-700'
                  : balance.status === 'atencao'
                    ? 'text-amber-700'
                    : 'text-emerald-700'
              }`}
            >
              {balance.status === 'critico'
                ? 'Crítico'
                : balance.status === 'atencao'
                  ? 'Atenção'
                  : 'Equilibrada'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {balance.placedCount} de {fleets.length} no mapa
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Trim Longitudinal (Proa / Popa)</p>
          <p className="text-lg font-extrabold font-mono tabular-nums text-slate-900 mt-1">
            {balance.longitudinalImbalancePct.toFixed(1)}%
          </p>
          <p className="text-xs text-slate-600 mt-1 font-mono tabular-nums">
            Proa {formatWeightTons(balance.bowWeightKg)} · Popa{' '}
            {formatWeightTons(balance.sternWeightKg)}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Banda Transversal (BB / BE)</p>
          <p className="text-lg font-extrabold font-mono tabular-nums text-slate-900 mt-1">
            {balance.transversalImbalancePct.toFixed(1)}%
          </p>
          <p className="text-xs text-slate-600 mt-1 font-mono tabular-nums">
            BB {formatWeightTons(balance.portWeightKg)} · BE{' '}
            {formatWeightTons(balance.starboardWeightKg)}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Carga Total / Capacidade</p>
          <p className="text-lg font-extrabold font-mono tabular-nums text-slate-900 mt-1">
            {formatWeightTons(balance.totalWeightKg)}
          </p>
          <p className="text-xs text-slate-600 mt-1 font-mono tabular-nums">
            {balance.utilizationPct.toFixed(1)}% de {specs.maxCapacityTons} t
          </p>
        </div>
      </section>

      {/* Critical Imbalance Alert highlighting Critical Fleets (Page 8 requirement) */}
      {balance.status === 'critico' && (
        <section
          role="alert"
          className="rounded-2xl bg-red-50 border-2 border-red-400 p-5 space-y-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <h2 className="text-base font-extrabold text-red-900">
                Desequilíbrio Extremo Detectado — Frotas Críticas Sinalizadas
              </h2>
              <p className="text-sm text-red-800">{balance.recommendations.join(' ')}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {balance.criticalFleetIds.map((cid) => {
              const f = fleets.find((fl) => fl.id === cid);
              if (!f) return null;
              const isUnlocked = unlockedCriticalIds.includes(cid);
              return (
                <div
                  key={cid}
                  className="inline-flex items-center gap-2 bg-white border border-red-300 rounded-xl px-3 py-2 text-xs"
                >
                  <span className="font-mono font-bold text-red-900">
                    {f.chassiIdentificador}
                  </span>
                  <span className="text-slate-600 tabular-nums">
                    {formatWeightTons(f.pesoTotalKg)}
                  </span>
                  {f.status === 'embarcada' && (
                    <button
                      type="button"
                      onClick={() =>
                        setUnlockedCriticalIds((prev) =>
                          prev.includes(cid)
                            ? prev.filter((x) => x !== cid)
                            : [...prev, cid],
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold cursor-pointer"
                    >
                      {isUnlocked ? (
                        <>
                          <Lock className="w-3 h-3" aria-hidden="true" />
                          <span>Travar</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3 h-3" aria-hidden="true" />
                          <span>Liberar Ajuste</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Barge & Boarding Characteristics Drawer + AI Indicative Pre-Map Generator */}
      {showSpecsPanel && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Características da Balsa e do Embarque (Entrada para IA)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Informe as características operacionais para a IA gerar um mapa prévio indicativo
                de onde distribuir pesos pesados, médios e leves.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSpecsPanel(false)}
              aria-label="Fechar características da balsa"
              className="p-2 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4 text-slate-500" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="barge-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Nome da Balsa
              </label>
              <input
                id="barge-name"
                type="text"
                placeholder="Ex.: Balsa BLS-129"
                value={specsDraft.name}
                onChange={(e) => setSpecsDraft({ ...specsDraft, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label htmlFor="barge-bls" className="block text-xs font-semibold text-slate-700 mb-1">
                Código BLS
              </label>
              <input
                id="barge-bls"
                type="text"
                placeholder="Ex.: 129"
                value={specsDraft.blsCode}
                onChange={(e) => setSpecsDraft({ ...specsDraft, blsCode: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
              />
            </div>

            <div>
              <label htmlFor="barge-em" className="block text-xs font-semibold text-slate-700 mb-1">
                Código EM (Empurrador)
              </label>
              <input
                id="barge-em"
                type="text"
                placeholder="Ex.: 72"
                value={specsDraft.emCode}
                onChange={(e) => setSpecsDraft({ ...specsDraft, emCode: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
              />
            </div>

            <div>
              <label htmlFor="barge-route" className="block text-xs font-semibold text-slate-700 mb-1">
                Rota / Destino
              </label>
              <input
                id="barge-route"
                type="text"
                placeholder="Ex.: Belém → Manaus (NAV MAO 48)"
                value={specsDraft.route}
                onChange={(e) => setSpecsDraft({ ...specsDraft, route: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label htmlFor="barge-cap" className="block text-xs font-semibold text-slate-700 mb-1">
                Capacidade Máxima (t)
              </label>
              <input
                id="barge-cap"
                type="number"
                min={100}
                max={5000}
                value={specsDraft.maxCapacityTons}
                onChange={(e) =>
                  setSpecsDraft({
                    ...specsDraft,
                    maxCapacityTons: Math.max(100, Number(e.target.value) || 950),
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="barge-rows" className="block text-xs font-semibold text-slate-700 mb-1">
                Faixas (Linhas BB → BE)
              </label>
              <input
                id="barge-rows"
                type="number"
                min={2}
                max={7}
                value={specsDraft.rows}
                onChange={(e) =>
                  setSpecsDraft({
                    ...specsDraft,
                    rows: Math.min(7, Math.max(2, Number(e.target.value) || 5)),
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="barge-cols" className="block text-xs font-semibold text-slate-700 mb-1">
                Posições (Proa → Popa)
              </label>
              <input
                id="barge-cols"
                type="number"
                min={3}
                max={12}
                value={specsDraft.cols}
                onChange={(e) =>
                  setSpecsDraft({
                    ...specsDraft,
                    cols: Math.min(12, Math.max(3, Number(e.target.value) || 7)),
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="barge-trim" className="block text-xs font-semibold text-slate-700 mb-1">
                Preferência de Trim
              </label>
              <select
                id="barge-trim"
                value={specsDraft.trimPreference}
                onChange={(e) =>
                  setSpecsDraft({
                    ...specsDraft,
                    trimPreference: e.target.value as TrimPreference,
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
              >
                <option value="neutro">Neutro (0% equilibrado)</option>
                <option value="popa_leve">Leve inclinação para Popa</option>
                <option value="proa_leve">Leve inclinação para Proa</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="barge-river" className="block text-xs font-semibold text-slate-700 mb-1">
              Condição do Rio / Navegação
            </label>
            <input
              id="barge-river"
              type="text"
              placeholder="Ex.: Calado operacional regular · Rio Amazonas"
              value={specsDraft.riverCondition}
              onChange={(e) => setSpecsDraft({ ...specsDraft, riverCondition: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>

          <div>
            <label htmlFor="barge-notes" className="block text-xs font-semibold text-slate-700 mb-1">
              Observações do Embarque (restrições estruturais, cargas perigosas, calado)
            </label>
            <textarea
              id="barge-notes"
              rows={2}
              value={specsDraft.specialNotes}
              onChange={(e) => setSpecsDraft({ ...specsDraft, specialNotes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                onUpdateSpecs(specsDraft);
                setShowSpecsPanel(false);
              }}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 min-h-[44px] cursor-pointer"
            >
              Salvar Características
            </button>
            <button
              type="button"
              disabled={aiLoading !== null}
              onClick={handleGenerateAiIndicativeMap}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F5B7C] hover:bg-[#0c4a66] disabled:opacity-60 text-white text-sm font-bold min-h-[44px] cursor-pointer"
            >
              {aiLoading === 'indicative' ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="w-4 h-4" aria-hidden="true" />
              )}
              <span>Gerar Mapa Prévio Indicativo com IA</span>
            </button>
          </div>
        </section>
      )}

      {aiError && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800"
        >
          {aiError}
        </div>
      )}

      {/* Landscape Barge Deck Hull matching PDF Page 8 */}
      <section
        aria-label="Mapa de estivagem da balsa"
        className="bg-[#38ADE0]/25 border-2 border-[#0F5B7C] rounded-3xl p-4 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#0F5B7C]">
          <span>← PROA (Frente da Balsa){specs.name ? ` · ${specs.name}` : ''}</span>
          <span className="font-mono tabular-nums">
            {selectedFleet
              ? `Carreta ${selectedFleet.chassiIdentificador} selecionada — clique em uma vaga para posicionar`
              : `Centro de Gravidade (CG): X ${(balance.cgX * 100).toFixed(0)}% · Y ${(balance.cgY * 100).toFixed(0)}%`}
          </span>
          <span>POPA / RAMPA →</span>
        </div>

        {/* Hull Deck + Yellow RAMPA */}
        <div className="overflow-x-auto pb-1">
          <div className="min-w-[740px] flex items-stretch gap-3">
            {/* Deck Grid with Subtle Non-Obstructing CG Axis Guides */}
            <div className="flex-1 bg-white rounded-2xl border border-slate-300 p-3 relative overflow-hidden">
              {balance.placedCount > 0 && (
                <>
                  <div
                    aria-hidden="true"
                    style={{ left: `${cgLeftPct}%` }}
                    className="pointer-events-none absolute top-2 bottom-2 w-px border-l border-dashed border-[#0F5B7C]/35 z-10 transition-all duration-200"
                  />
                  <div
                    aria-hidden="true"
                    style={{ top: `${cgTopPct}%` }}
                    className="pointer-events-none absolute left-2 right-2 h-px border-t border-dashed border-[#0F5B7C]/35 z-10 transition-all duration-200"
                  />
                </>
              )}

              {/* Column headers */}
              <div
                className="grid gap-2 mb-2 pl-7"
                style={{ gridTemplateColumns: `repeat(${specs.cols}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: specs.cols }, (_, col) => (
                  <div
                    key={col}
                    className="text-center text-[11px] font-mono font-semibold text-slate-500"
                  >
                    Pos {col + 1}
                    {col === 0 ? ' (Proa)' : col === specs.cols - 1 ? ' (Popa)' : ''}
                  </div>
                ))}
              </div>

              {/* Rows (Lanes A..E) */}
              <div className="space-y-2">
                {Array.from({ length: specs.rows }, (_, row) => (
                  <div key={row} className="flex items-stretch gap-2">
                    <div className="w-5 flex items-center justify-center text-[11px] font-mono font-bold text-slate-500 shrink-0">
                      {LANE_LETTERS[row] ?? row + 1}
                    </div>
                    <div
                      className="flex-1 grid gap-2"
                      style={{ gridTemplateColumns: `repeat(${specs.cols}, minmax(0, 1fr))` }}
                    >
                      {Array.from({ length: specs.cols }, (_, col) => {
                        const occupant = slotLookup.get(`${row}:${col}`);
                        const zone = indicativeLookup.get(`${row}:${col}`);
                        const coordLabel = `${LANE_LETTERS[row] ?? row + 1}${col + 1}`;
                        const isSelected = occupant && occupant.id === selectedFleetId;
                        const isCritical = occupant && criticalSet.has(occupant.id);
                        const isBoarded = occupant?.status === 'embarcada';
                        const isMovable = occupant ? canMoveFleet(occupant) : true;

                        return (
                          <div
                            key={`${row}-${col}`}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDropOnSlot(e, row, col)}
                            className="relative"
                          >
                            <button
                              type="button"
                              draggable={Boolean(occupant && isMovable)}
                              onDragStart={(e) => {
                                if (!occupant || !isMovable) return;
                                e.dataTransfer.setData('text/plain', occupant.id);
                                setDraggedFleetId(occupant.id);
                              }}
                              onClick={() => handleSlotClick(row, col)}
                              aria-label={
                                occupant
                                  ? `Vaga ${coordLabel}: Frota ${occupant.chassiIdentificador}, ${formatWeightTons(occupant.pesoTotalKg)}${isBoarded ? ', embarcada e travada' : occupant.isPinned ? ', fixada' : ''}`
                                  : `Vaga ${coordLabel} vazia${zone ? `, zona ${zone.tier} (${zone.recommendedMinTons} a ${zone.recommendedMaxTons} toneladas)` : ''}`
                              }
                              className={`w-full h-[76px] rounded-xl border p-2 text-left flex flex-col justify-between transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0284C7] ${
                                occupant
                                  ? isCritical
                                    ? 'bg-red-100 border-red-600 text-red-950 ring-2 ring-red-400'
                                    : isBoarded
                                      ? 'bg-[#0F5B7C] border-[#0a3e54] text-white'
                                      : occupant.isPinned
                                        ? 'bg-amber-50 border-amber-500 text-slate-900'
                                        : 'bg-sky-50 border-[#0284C7] text-slate-900'
                                  : showIndicative
                                    ? tierStyle(zone?.tier)
                                    : 'bg-slate-50 border-dashed border-slate-300 text-slate-400 hover:border-[#0284C7]'
                              } ${isSelected ? 'ring-2 ring-[#FACC15] scale-[1.02]' : ''}`}
                            >
                              {occupant ? (
                                <>
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-mono font-extrabold text-[11px] truncate">
                                      {occupant.chassiIdentificador}
                                    </span>
                                    <span className="shrink-0">
                                      {isBoarded ? (
                                        <Lock className="w-3 h-3 opacity-90" aria-hidden="true" />
                                      ) : occupant.isPinned ? (
                                        <Pin className="w-3 h-3 text-amber-700" aria-hidden="true" />
                                      ) : null}
                                    </span>
                                  </div>
                                  <div className="flex items-end justify-between gap-1">
                                    <span
                                      className={`font-mono text-[11px] font-semibold tabular-nums ${
                                        isBoarded && !isCritical
                                          ? 'text-[#FACC15]'
                                          : 'text-slate-700'
                                      }`}
                                    >
                                      {formatWeightTons(occupant.pesoTotalKg)}
                                    </span>
                                    <span
                                      className={`text-[9px] font-semibold ${
                                        isBoarded && !isCritical
                                          ? 'text-sky-200'
                                          : 'text-slate-500'
                                      }`}
                                    >
                                      {isCritical
                                        ? 'Crítica'
                                        : isBoarded
                                          ? 'Embarc.'
                                          : occupant.isPinned
                                            ? 'Fixa'
                                            : coordLabel}
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <span className="font-mono text-[10px] font-semibold opacity-70">
                                    {coordLabel}
                                  </span>
                                  {showIndicative && zone ? (
                                    <div className="leading-tight">
                                      <p className="text-[10px] font-bold capitalize">
                                        {zone.tier}
                                      </p>
                                      <p className="text-[9px] font-mono tabular-nums opacity-80">
                                        {zone.recommendedMinTons}-{zone.recommendedMaxTons}t
                                      </p>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] opacity-60">Livre</span>
                                  )}
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Yellow Vertical RAMPA matching PDF Page 8 */}
            <div className="w-12 rounded-2xl bg-[#FACC15] border-2 border-amber-500 flex items-center justify-center shrink-0 select-none">
              <span
                className="font-display font-extrabold tracking-[0.25em] text-slate-950 text-sm"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                RAMPA
              </span>
            </div>
          </div>
        </div>

        {/* Selected Fleet Contextual Action Bar (Pin / Unplace) + Primary EQUILIBRAR button */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pt-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
            {selectedFleet ? (
              <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2">
                <span className="font-mono font-bold text-slate-900">
                  {selectedFleet.chassiIdentificador}
                </span>
                <span className="text-slate-500 tabular-nums">
                  ({formatWeightTons(selectedFleet.pesoTotalKg)})
                </span>
                {selectedFleet.status !== 'embarcada' && selectedFleet.mapPosition && (
                  <button
                    type="button"
                    onClick={() => onTogglePin(selectedFleet.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 font-semibold cursor-pointer"
                  >
                    {selectedFleet.isPinned ? (
                      <>
                        <PinOff className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Desafixar</span>
                      </>
                    ) : (
                      <>
                        <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Fixar Posição</span>
                      </>
                    )}
                  </button>
                )}
                {selectedFleet.mapPosition && canMoveFleet(selectedFleet) && (
                  <button
                    type="button"
                    onClick={() => {
                      onMoveFleet(selectedFleet.id, null, unlockedCriticalIds.includes(selectedFleet.id));
                      setSelectedFleetId(null);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Tirar do Mapa</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
                <span>Azul escuro: Embarcada (imutável)</span>
                <span>·</span>
                <span>Âmbar: Fixada pelo operador</span>
                <span>·</span>
                <span>Azul claro: Planejada</span>
              </div>
            )}
          </div>

          {/* Signature EQUILIBRAR Button from PDF Page 8 */}
          <button
            type="button"
            onClick={onOptimize}
            className="inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl bg-[#0F5B7C] hover:bg-[#0b455f] active:scale-[0.98] text-white font-extrabold tracking-wide text-sm min-h-[48px] shadow-md shadow-[#0F5B7C]/20 cursor-pointer transition-all whitespace-nowrap"
          >
            <Scale className="w-5 h-5 text-[#FACC15]" aria-hidden="true" />
            <span>EQUILIBRAR</span>
          </button>
        </div>
      </section>

      {/* Bottom Split: Unplaced Fleets Tray + AI Suggestions / Indicative Guidelines */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              Frotas Pendentes de Posicionamento ({unplacedFleets.length})
            </h2>
            <span className="text-xs text-slate-500">Arraste ou clique para estivar</span>
          </div>

          {unplacedFleets.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">
              {fleets.length === 0
                ? 'Nenhuma frota cadastrada ainda. Cadastre as frotas do manifesto para iniciar a estivagem.'
                : 'Todas as frotas do plano de embarque já estão posicionadas no mapa.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {unplacedFleets.map((fleet) => {
                const isSelected = selectedFleetId === fleet.id;
                return (
                  <button
                    key={fleet.id}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', fleet.id);
                      setDraggedFleetId(fleet.id);
                    }}
                    onClick={() =>
                      setSelectedFleetId(isSelected ? null : fleet.id)
                    }
                    className={`text-left p-3.5 rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
                      isSelected
                        ? 'border-[#0284C7] bg-sky-50 ring-2 ring-sky-200'
                        : 'border-slate-200 bg-slate-50/70 hover:border-[#0284C7]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-sm text-slate-900">
                        {fleet.chassiIdentificador}
                      </span>
                      <span className="font-mono font-bold text-xs tabular-nums text-[#0F5B7C]">
                        {formatWeightTons(fleet.pesoTotalKg)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 truncate mt-1">
                      {fleet.descricaoCarga}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Leva {fleet.waveNumber} · {fleet.unidadeDestino}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            Orientação de Equilíbrio & Diretrizes IA
          </h2>

          {aiAdvisory ? (
            <div className="space-y-3 text-sm">
              <p className="text-slate-800 leading-relaxed">{aiAdvisory.diagnostico}</p>
              {aiAdvisory.alertaCritico && (
                <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {aiAdvisory.alertaCritico}
                </p>
              )}
              <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                {aiAdvisory.acoesRecomendadas.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-3">
              <ul className="space-y-2 text-sm text-slate-700 list-disc pl-4">
                {balance.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>

              {indicativeGuidelines.length > 0 && (
                <div className="pt-3 border-t border-slate-100 space-y-1.5">
                  <p className="text-xs font-bold text-[#0F5B7C]">
                    Diretrizes do Mapa Prévio Indicativo
                  </p>
                  <ul className="space-y-1 text-xs text-slate-600 list-disc pl-4">
                    {indicativeGuidelines.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
