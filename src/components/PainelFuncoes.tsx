import React from 'react';
import {
  Camera,
  FileSpreadsheet,
  LayoutGrid,
  FileText,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  Scale,
} from 'lucide-react';
import { TblLogo } from './TblLogo';
import type {
  AppTab,
  BalanceAnalysis,
  BargeSpecs,
  FleetRecord,
  OccurrenceRecord,
  ScanLogEntry,
} from '../types/operation';
import { formatWeightTons } from '../utils/balanceEngine';

interface PainelFuncoesProps {
  specs: BargeSpecs;
  fleets: FleetRecord[];
  balance: BalanceAnalysis;
  scanLogs: ScanLogEntry[];
  occurrences: OccurrenceRecord[];
  onNavigate: (tab: AppTab) => void;
}

export const PainelFuncoes: React.FC<PainelFuncoesProps> = ({
  specs,
  fleets,
  balance,
  scanLogs,
  occurrences,
  onNavigate,
}) => {
  const boardedCount = fleets.filter((f) => f.status === 'embarcada').length;
  const waitingCount = fleets.length - boardedCount;
  const unplacedCount = fleets.filter((f) => !f.mapPosition).length;
  const totalManifestKg = fleets.reduce((acc, f) => acc + f.pesoTotalKg, 0);

  const balanceLabel =
    balance.status === 'equilibrada'
      ? 'Balsa equilibrada'
      : balance.status === 'atencao'
        ? 'Atenção no equilíbrio'
        : 'Desequilíbrio crítico';

  const balanceColor =
    balance.status === 'equilibrada'
      ? 'text-emerald-700'
      : balance.status === 'atencao'
        ? 'text-amber-700'
        : 'text-red-700';

  const modules: Array<{
    id: AppTab;
    title: string;
    subtitle: string;
    meta: string;
    icon: React.ReactNode;
    accent: string;
  }> = [
    {
      id: 'scanner',
      title: 'Scanner de Frota',
      subtitle:
        'Escaneie a placa ou identificador na entrada da rampa com IA, valide autorização e registre o embarque.',
      meta: `${waitingCount} aguardando entrada · ${scanLogs.length} leituras`,
      icon: <Camera className="w-6 h-6" aria-hidden="true" />,
      accent: 'bg-sky-50 text-[#0F5B7C]',
    },
    {
      id: 'cadastrar',
      title: 'Cadastrar Frotas',
      subtitle:
        'Digitalize a folha ou arquivo do manifesto de expedição por IA com conferência obrigatória linha a linha.',
      meta: `${fleets.length} frotas no plano · ${formatWeightTons(totalManifestKg)}`,
      icon: <FileSpreadsheet className="w-6 h-6" aria-hidden="true" />,
      accent: 'bg-sky-50 text-[#0F5B7C]',
    },
    {
      id: 'mapa',
      title: 'Criação de Mapa',
      subtitle:
        'Posicione carretas na balsa, fixe posições obrigatórias, gere mapa prévio com IA e equilibre automaticamente.',
      meta: `${balance.placedCount}/${fleets.length} posicionadas · ${unplacedCount} pendentes`,
      icon: <LayoutGrid className="w-6 h-6" aria-hidden="true" />,
      accent: 'bg-sky-50 text-[#0F5B7C]',
    },
    {
      id: 'relatorios',
      title: 'Gerador de Relatórios',
      subtitle:
        'Gere o dossiê completo com mapa de estivagem, análise de equilíbrio por IA e registro fotográfico de ocorrências.',
      meta: `${occurrences.length} ${occurrences.length === 1 ? 'ocorrência' : 'ocorrências'} · Pronto para impressão`,
      icon: <FileText className="w-6 h-6" aria-hidden="true" />,
      accent: 'bg-sky-50 text-[#0F5B7C]',
    },
  ];

  const vesselMeta = [
    specs.name || 'Operação pronta para início',
    specs.blsCode ? `BLS ${specs.blsCode}` : null,
    specs.emCode ? `EM ${specs.emCode}` : null,
    specs.route || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-8">
      {/* Operational Overview Header */}
      <section className="bg-[#146082] text-white rounded-2xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs font-medium text-sky-200">{vesselMeta}</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Painel de Funções
          </h1>
          <p className="text-sm sm:text-base text-sky-100 leading-relaxed">
            Selecione uma etapa da operação carreteira para validar frotas na rampa,
            importar novas levas da expedição, equilibrar a balsa ou emitir o relatório final.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-4 shrink-0 bg-white/10 rounded-xl p-4 border border-white/15">
          <div>
            <p className="text-xs text-sky-100">Embarcadas</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-white">
              {boardedCount}/{fleets.length}
            </p>
          </div>
          <div>
            <p className="text-xs text-sky-100">Peso no Mapa</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-[#FACC15]">
              {formatWeightTons(balance.totalWeightKg)}
            </p>
          </div>
          <div>
            <p className="text-xs text-sky-100">Trim / Banda</p>
            <p className="text-sm font-semibold font-mono tabular-nums text-white mt-1">
              {balance.longitudinalImbalancePct.toFixed(1)}% /{' '}
              {balance.transversalImbalancePct.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-sky-100">Ocupação</p>
            <p className="text-sm font-semibold font-mono tabular-nums text-white mt-1">
              {balance.placedCount}/{specs.rows * specs.cols} vagas
            </p>
          </div>
        </div>
      </section>

      {/* Core 4 Module Buttons matching PDF Painel de Funções */}
      <section aria-label="Módulos principais">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {modules.map((mod) => (
            <button
              key={mod.id}
              type="button"
              onClick={() => onNavigate(mod.id)}
              className="group text-left bg-white rounded-2xl p-6 border border-slate-200 hover:border-[#0284C7] hover:shadow-md transition-all flex flex-col justify-between gap-5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0284C7]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${mod.accent}`}>
                  {mod.icon}
                </div>
                <ArrowUpRight
                  className="w-5 h-5 text-slate-400 group-hover:text-[#0284C7] transition-colors shrink-0"
                  aria-hidden="true"
                />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-lg font-bold text-slate-900 group-hover:text-[#0F5B7C] transition-colors">
                  {mod.title}
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {mod.subtitle}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 text-xs font-medium text-slate-500 tabular-nums">
                {mod.meta}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Live Stability & Operational Summary Strip */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-700">
            {balance.status === 'critico' ? (
              <AlertTriangle className="w-5 h-5 text-red-600" aria-hidden="true" />
            ) : balance.status === 'atencao' ? (
              <Scale className="w-5 h-5 text-amber-600" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" aria-hidden="true" />
            )}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`font-bold ${balanceColor}`}>
                {fleets.length === 0 ? 'Aguardando cadastro de frotas' : balanceLabel}
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="text-slate-600 tabular-nums">
                Capacidade {balance.utilizationPct.toFixed(1)}% de {specs.maxCapacityTons} t
              </span>
            </div>
            <p className="text-sm text-slate-600">
              {fleets.length === 0
                ? 'Comece cadastrando o manifesto da expedição em Cadastrar Frotas ou configurando a balsa em Criação de Mapa.'
                : balance.recommendations[0]}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between lg:justify-end gap-6 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-100 shrink-0">
          <TblLogo variant="dark" size="sm" />
          <div className="text-right text-xs text-slate-500">
            <p className="font-medium text-slate-700">Operação Carreteira</p>
            <p>Desenvolvido por: Emmili O. Gonçalves</p>
          </div>
        </div>
      </section>
    </div>
  );
};
