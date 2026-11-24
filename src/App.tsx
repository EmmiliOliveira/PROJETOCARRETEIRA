import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Camera,
  FileSpreadsheet,
  LayoutGrid,
  FileText,
} from 'lucide-react';
import { SplashScreen } from './components/SplashScreen';
import { PainelFuncoes } from './components/PainelFuncoes';
import { ScannerFrota } from './components/ScannerFrota';
import { CadastrarFrotas } from './components/CadastrarFrotas';
import { CriacaoMapa } from './components/CriacaoMapa';
import { GeradorRelatorios } from './components/GeradorRelatorios';
import {
  DEFAULT_BARGE_SPECS,
  INITIAL_FLEETS,
  INITIAL_OCCURRENCES,
  INITIAL_SCAN_LOGS,
} from './data/seedData';
import type {
  AiExecutiveReport,
  AppTab,
  BargeSpecs,
  FleetRecord,
  GridPosition,
  IndicativeZoneCell,
  OccurrenceRecord,
  PendingManifestFleet,
  ScanLogEntry,
} from './types/operation';
import {
  buildDefaultIndicativeMap,
  calculateBalance,
  normalizeIdentifier,
  optimizeStowageMap,
} from './utils/balanceEngine';

const STORAGE_KEY = 'tbl_operacao_carreteira_clean_v2';
const LEGACY_STORAGE_KEY = 'tbl_operacao_carreteira_v1';

interface PersistedState {
  specs: BargeSpecs;
  fleets: FleetRecord[];
  scanLogs: ScanLogEntry[];
  occurrences: OccurrenceRecord[];
  indicativeMap: IndicativeZoneCell[];
  indicativeGuidelines: string[];
  aiReport: AiExecutiveReport | null;
}

function loadInitialState(): PersistedState {
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      if (parsed.specs && Array.isArray(parsed.fleets)) {
        return {
          specs: parsed.specs,
          fleets: parsed.fleets,
          scanLogs: Array.isArray(parsed.scanLogs) ? parsed.scanLogs : [],
          occurrences: Array.isArray(parsed.occurrences) ? parsed.occurrences : [],
          indicativeMap:
            Array.isArray(parsed.indicativeMap) && parsed.indicativeMap.length > 0
              ? parsed.indicativeMap
              : buildDefaultIndicativeMap(parsed.specs),
          indicativeGuidelines: Array.isArray(parsed.indicativeGuidelines)
            ? parsed.indicativeGuidelines
            : [],
          aiReport: parsed.aiReport ?? null,
        };
      }
    }
  } catch {
    // Fall back to clean empty state
  }

  return {
    specs: DEFAULT_BARGE_SPECS,
    fleets: INITIAL_FLEETS,
    scanLogs: INITIAL_SCAN_LOGS,
    occurrences: INITIAL_OCCURRENCES,
    indicativeMap: buildDefaultIndicativeMap(DEFAULT_BARGE_SPECS),
    indicativeGuidelines: [],
    aiReport: null,
  };
}

export default function App() {
  const initialAutostart = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1';
  }, []);

  const [showSplash, setShowSplash] = useState(!initialAutostart);
  const [activeTab, setActiveTab] = useState<AppTab>('painel');
  const [state, setState] = useState<PersistedState>(() => loadInitialState());

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors (e.g., very large attached photos)
    }
  }, [state]);

  const balance = useMemo(
    () => calculateBalance(state.fleets, state.specs),
    [state.fleets, state.specs],
  );

  const handleAuthorizeBoard = (
    fleetId: string,
    method: 'ia_camera' | 'manual',
    scannedCode: string,
  ) => {
    setState((prev) => {
      const target = prev.fleets.find((f) => f.id === fleetId);
      if (!target) return prev;

      const updatedFleets = prev.fleets.map((f) =>
        f.id === fleetId
          ? {
              ...f,
              status: 'embarcada' as const,
              boardedAt: new Date().toISOString(),
            }
          : f,
      );

      // If the newly boarded fleet did not have a slot yet, auto-place it optimally without moving other boarded/pinned fleets
      let finalFleets = updatedFleets;
      const nowBoarded = updatedFleets.find((f) => f.id === fleetId);
      if (nowBoarded && !nowBoarded.mapPosition) {
        finalFleets = optimizeStowageMap(updatedFleets, prev.specs, prev.indicativeMap);
      }

      const logEntry: ScanLogEntry = {
        id: `scan-${Date.now()}`,
        scannedCode,
        matchedFleetId: fleetId,
        outcome: 'autorizada',
        method,
        timestamp: new Date().toISOString(),
        note: `Frota ${target.chassiIdentificador} (${target.descricaoCarga}) confirmada e marcada como embarcada.`,
      };

      return {
        ...prev,
        fleets: finalFleets,
        scanLogs: [logEntry, ...prev.scanLogs],
      };
    });
  };

  const handleLogUnauthorized = (scannedCode: string, method: 'ia_camera' | 'manual') => {
    setState((prev) => ({
      ...prev,
      scanLogs: [
        {
          id: `scan-${Date.now()}`,
          scannedCode,
          outcome: 'nao_cadastrada',
          method,
          timestamp: new Date().toISOString(),
          note: 'Frota fora do plano de embarque — retirada da fila na rampa.',
        },
        ...prev.scanLogs,
      ],
    }));
  };

  const handleConfirmManifestBatch = (verified: PendingManifestFleet[]): number => {
    let addedCount = 0;
    setState((prev) => {
      const existingCodes = new Set(
        prev.fleets.map((f) => normalizeIdentifier(f.chassiIdentificador)),
      );
      const nextWave =
        prev.fleets.reduce((max, f) => Math.max(max, f.waveNumber), 0) + 1;

      const newRecords: FleetRecord[] = [];
      for (const item of verified) {
        const cleanCode = normalizeIdentifier(item.chassiIdentificador);
        if (!cleanCode || existingCodes.has(cleanCode)) continue;
        existingCodes.add(cleanCode);
        newRecords.push({
          id: `tbl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          unidadeDestino: item.unidadeDestino || '—',
          veiculo: item.veiculo,
          chassiIdentificador: cleanCode,
          descricaoCarga: item.descricaoCarga || 'CARGA MANIFESTADA',
          pesoCargaKg: item.pesoCargaKg,
          pesoTotalKg: item.pesoTotalKg,
          bls: item.bls || prev.specs.blsCode,
          em: item.em || prev.specs.emCode,
          status: 'aguardando',
          waveNumber: nextWave,
          registeredAt: new Date().toISOString(),
          mapPosition: null,
          isPinned: false,
        });
      }

      addedCount = newRecords.length;
      return {
        ...prev,
        fleets: [...prev.fleets, ...newRecords],
      };
    });
    return addedCount;
  };

  const handleDeleteFleet = (fleetId: string) => {
    setState((prev) => ({
      ...prev,
      fleets: prev.fleets.filter(
        (f) => !(f.id === fleetId && f.status !== 'embarcada'),
      ),
    }));
  };

  const handleMoveFleet = (
    fleetId: string,
    target: GridPosition | null,
    forceOverride = false,
  ) => {
    setState((prev) => {
      const moving = prev.fleets.find((f) => f.id === fleetId);
      if (!moving) return prev;
      if (moving.status === 'embarcada' && !forceOverride) return prev;

      const occupant = target
        ? prev.fleets.find(
            (f) =>
              f.id !== fleetId &&
              f.mapPosition &&
              f.mapPosition.row === target.row &&
              f.mapPosition.col === target.col,
          )
        : undefined;

      if (occupant && occupant.status === 'embarcada' && !forceOverride) {
        return prev;
      }

      const prevPos = moving.mapPosition ?? null;

      return {
        ...prev,
        fleets: prev.fleets.map((f) => {
          if (f.id === fleetId) {
            return { ...f, mapPosition: target };
          }
          if (occupant && f.id === occupant.id) {
            return { ...f, mapPosition: prevPos };
          }
          return f;
        }),
      };
    });
  };

  const handleTogglePin = (fleetId: string) => {
    setState((prev) => ({
      ...prev,
      fleets: prev.fleets.map((f) =>
        f.id === fleetId && f.status !== 'embarcada'
          ? { ...f, isPinned: !f.isPinned }
          : f,
      ),
    }));
  };

  const handleOptimizeMap = () => {
    setState((prev) => ({
      ...prev,
      fleets: optimizeStowageMap(prev.fleets, prev.specs, prev.indicativeMap),
    }));
  };

  const handleUpdateSpecs = (nextSpecs: BargeSpecs) => {
    setState((prev) => {
      const dimsChanged =
        prev.specs.rows !== nextSpecs.rows || prev.specs.cols !== nextSpecs.cols;
      return {
        ...prev,
        specs: nextSpecs,
        indicativeMap: dimsChanged
          ? buildDefaultIndicativeMap(nextSpecs)
          : prev.indicativeMap,
      };
    });
  };

  const handleUpdateIndicativeMap = (
    cells: IndicativeZoneCell[],
    guidelines: string[],
  ) => {
    setState((prev) => ({
      ...prev,
      indicativeMap: cells,
      indicativeGuidelines: guidelines,
    }));
  };

  const handleAddOccurrence = (occ: Omit<OccurrenceRecord, 'id' | 'timestamp'>) => {
    setState((prev) => ({
      ...prev,
      occurrences: [
        {
          ...occ,
          id: `occ-${Date.now()}`,
          timestamp: new Date().toISOString(),
        },
        ...prev.occurrences,
      ],
    }));
  };

  const handleDeleteOccurrence = (id: string) => {
    setState((prev) => ({
      ...prev,
      occurrences: prev.occurrences.filter((o) => o.id !== id),
    }));
  };

  const handleSetAiReport = (report: AiExecutiveReport) => {
    setState((prev) => ({
      ...prev,
      aiReport: report,
    }));
  };

  if (showSplash) {
    return (
      <SplashScreen
        specs={state.specs}
        boardedCount={state.fleets.filter((f) => f.status === 'embarcada').length}
        totalFleets={state.fleets.length}
        onEnter={() => setShowSplash(false)}
      />
    );
  }

  const navItems: Array<{
    id: AppTab;
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'painel',
      label: 'Painel',
      shortLabel: 'Painel',
      icon: <LayoutDashboard className="w-5 h-5" aria-hidden="true" />,
    },
    {
      id: 'scanner',
      label: 'Scanner',
      shortLabel: 'Scanner',
      icon: <Camera className="w-5 h-5" aria-hidden="true" />,
    },
    {
      id: 'cadastrar',
      label: 'Cadastrar',
      shortLabel: 'Cadastrar',
      icon: <FileSpreadsheet className="w-5 h-5" aria-hidden="true" />,
    },
    {
      id: 'mapa',
      label: 'Mapa',
      shortLabel: 'Mapa',
      icon: <LayoutGrid className="w-5 h-5" aria-hidden="true" />,
    },
    {
      id: 'relatorios',
      label: 'Relatórios',
      shortLabel: 'Relatórios',
      icon: <FileText className="w-5 h-5" aria-hidden="true" />,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7FA] text-slate-900">
      {/* Clean 3-Zone Top Bar Contract (single row, whitespace-nowrap) */}
      <header className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Title */}
          <button
            type="button"
            onClick={() => setActiveTab('painel')}
            className="font-display text-lg font-extrabold tracking-tight text-[#0F5B7C] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0284C7]"
          >
            TBL Carreteira
          </button>

          {/* Zone 2: 5 concise single-line nav links (desktop) */}
          <nav
            aria-label="Navegação principal"
            className="hidden md:flex items-center gap-6 text-sm font-semibold"
          >
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                    active
                      ? 'text-[#0F5B7C] border-[#0F5B7C]'
                      : 'text-slate-600 border-transparent hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary contextual action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('scanner')}
              className="px-4 py-2 rounded-lg bg-[#0F5B7C] hover:bg-[#0c4a66] text-white text-xs font-bold whitespace-nowrap shrink-0 min-h-[40px] cursor-pointer transition-colors"
            >
              Escanear Frota
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 md:pb-10">
        {activeTab === 'painel' && (
          <PainelFuncoes
            specs={state.specs}
            fleets={state.fleets}
            balance={balance}
            scanLogs={state.scanLogs}
            occurrences={state.occurrences}
            onNavigate={setActiveTab}
          />
        )}

        {activeTab === 'scanner' && (
          <ScannerFrota
            fleets={state.fleets}
            scanLogs={state.scanLogs}
            onAuthorizeBoard={handleAuthorizeBoard}
            onLogUnauthorized={handleLogUnauthorized}
          />
        )}

        {activeTab === 'cadastrar' && (
          <CadastrarFrotas
            specs={state.specs}
            fleets={state.fleets}
            onConfirmBatch={handleConfirmManifestBatch}
            onDeleteFleet={handleDeleteFleet}
            onGoToMap={() => setActiveTab('mapa')}
          />
        )}

        {activeTab === 'mapa' && (
          <CriacaoMapa
            specs={state.specs}
            fleets={state.fleets}
            balance={balance}
            indicativeMap={state.indicativeMap}
            indicativeGuidelines={state.indicativeGuidelines}
            onUpdateSpecs={handleUpdateSpecs}
            onUpdateIndicativeMap={handleUpdateIndicativeMap}
            onMoveFleet={handleMoveFleet}
            onTogglePin={handleTogglePin}
            onOptimize={handleOptimizeMap}
          />
        )}

        {activeTab === 'relatorios' && (
          <GeradorRelatorios
            specs={state.specs}
            fleets={state.fleets}
            balance={balance}
            scanLogs={state.scanLogs}
            occurrences={state.occurrences}
            aiReport={state.aiReport}
            onAddOccurrence={handleAddOccurrence}
            onDeleteOccurrence={handleDeleteOccurrence}
            onSetAiReport={handleSetAiReport}
          />
        )}
      </main>

      {/* Mobile Compact Bottom Tab Bar (<= 15% aggregate sticky cap with top bar) */}
      <nav
        aria-label="Navegação inferior"
        className="no-print md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200"
      >
        <div className="grid grid-cols-5 items-center h-14">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center h-full min-h-[44px] gap-0.5 cursor-pointer transition-colors ${
                  active ? 'text-[#0F5B7C] font-bold' : 'text-slate-500'
                }`}
              >
                {item.icon}
                <span className="text-[10px] tracking-tight whitespace-nowrap">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
