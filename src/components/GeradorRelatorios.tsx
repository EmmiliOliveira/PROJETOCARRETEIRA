import React, { useRef, useState } from 'react';
import {
  Camera,
  Printer,
  Download,
  Sparkles,
  Loader2,
  PlusCircle,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Scale,
  Image as ImageIcon,
} from 'lucide-react';
import { TblLogo } from './TblLogo';
import type {
  AiExecutiveReport,
  BalanceAnalysis,
  BargeSpecs,
  FleetRecord,
  OccurrencePhase,
  OccurrenceRecord,
  OccurrenceSeverity,
  ScanLogEntry,
} from '../types/operation';
import { formatWeightKg, formatWeightTons } from '../utils/balanceEngine';

interface GeradorRelatoriosProps {
  specs: BargeSpecs;
  fleets: FleetRecord[];
  balance: BalanceAnalysis;
  scanLogs: ScanLogEntry[];
  occurrences: OccurrenceRecord[];
  aiReport: AiExecutiveReport | null;
  onAddOccurrence: (occ: Omit<OccurrenceRecord, 'id' | 'timestamp'>) => void;
  onDeleteOccurrence: (id: string) => void;
  onSetAiReport: (report: AiExecutiveReport) => void;
}

const LANE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

export const GeradorRelatorios: React.FC<GeradorRelatoriosProps> = ({
  specs,
  fleets,
  balance,
  scanLogs,
  occurrences,
  aiReport,
  onAddOccurrence,
  onDeleteOccurrence,
  onSetAiReport,
}) => {
  const [phase, setPhase] = useState<OccurrencePhase>('embarque');
  const [severity, setSeverity] = useState<OccurrenceSeverity>('informativo');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fleetCode, setFleetCode] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSavedMsg, setFormSavedMsg] = useState<string | null>(null);

  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoDataUrl(String(reader.result));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmitOccurrence = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setFormError('Informe o título e a descrição detalhada da ocorrência.');
      return;
    }
    setFormError(null);
    onAddOccurrence({
      phase,
      severity,
      title: title.trim(),
      description: description.trim(),
      fleetCode: fleetCode || undefined,
      photoDataUrl,
    });
    setTitle('');
    setDescription('');
    setFleetCode('');
    setPhotoDataUrl(undefined);
    setFormSavedMsg('Ocorrência registrada e anexada ao relatório operacional.');
  };

  const handleGenerateAiSummary = async () => {
    setGeneratingAi(true);
    setAiError(null);
    try {
      const response = await fetch('/api/ai/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specs,
          balance,
          fleets: fleets.map((f) => ({
            placa: f.chassiIdentificador,
            veiculo: f.veiculo,
            carga: f.descricaoCarga,
            pesoTotalKg: f.pesoTotalKg,
            status: f.status,
            posicao: f.mapPosition
              ? `${LANE_LETTERS[f.mapPosition.row]}${f.mapPosition.col + 1}`
              : 'sem posição',
          })),
          scanSummary: {
            totalLeituras: scanLogs.length,
            autorizadas: scanLogs.filter((s) => s.outcome === 'autorizada').length,
            naoCadastradas: scanLogs.filter((s) => s.outcome === 'nao_cadastrada').length,
          },
          occurrences: occurrences.map((o) => ({
            fase: o.phase,
            severidade: o.severity,
            titulo: o.title,
            descricao: o.description,
            frota: o.fleetCode,
            possuiFoto: Boolean(o.photoDataUrl),
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao gerar parecer operacional com IA.');
      }
      onSetAiReport(data);
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Não foi possível gerar o parecer operacional por IA.',
      );
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleExportCsv = () => {
    const header = [
      'Unidade Destino',
      'Veículo',
      'Chassi/Identificador',
      'Descrição Carga',
      'Peso Carga (kg)',
      'Peso Total (kg)',
      'BLS',
      'EM',
      'Situação',
      'Posição Mapa',
    ].join(';');
    const rows = fleets.map((f) =>
      [
        f.unidadeDestino,
        f.veiculo,
        f.chassiIdentificador,
        `"${f.descricaoCarga.replace(/"/g, '""')}"`,
        f.pesoCargaKg.toFixed(3),
        f.pesoTotalKg.toFixed(3),
        f.bls,
        f.em,
        f.status === 'embarcada' ? 'EMBARCADA' : 'AGUARDANDO',
        f.mapPosition ? `${LANE_LETTERS[f.mapPosition.row]}${f.mapPosition.col + 1}` : '-',
      ].join(';'),
    );
    const csvContent = '\uFEFF' + [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-tbl-bls-${specs.blsCode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const slotMap = new Map<string, FleetRecord>();
  for (const f of fleets) {
    if (f.mapPosition) {
      slotMap.set(`${f.mapPosition.row}:${f.mapPosition.col}`, f);
    }
  }

  const boardedFleets = fleets.filter((f) => f.status === 'embarcada');
  const waitingFleets = fleets.filter((f) => f.status !== 'embarcada');

  return (
    <div className="space-y-8">
      {/* Top Action Header */}
      <div className="no-print flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Gerador de Relatórios</h1>
          <p className="text-sm text-slate-600 mt-1">
            Registre ocorrências com foto durante embarque ou desembarque e emita o dossiê completo
            da operação carreteira.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={generatingAi}
            onClick={handleGenerateAiSummary}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F5B7C] hover:bg-[#0c4a66] disabled:opacity-60 text-white text-sm font-semibold min-h-[44px] whitespace-nowrap cursor-pointer"
          >
            {generatingAi ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="w-4 h-4" aria-hidden="true" />
            )}
            <span>Gerar Parecer com IA</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold min-h-[44px] whitespace-nowrap cursor-pointer"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>Exportar CSV</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold min-h-[44px] whitespace-nowrap cursor-pointer"
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            <span>Imprimir / PDF</span>
          </button>
        </div>
      </div>

      {/* Occurrence Logger with Camera / Photo Capture (Page 9 requirement) */}
      <section className="no-print bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Registro de Ocorrências (Embarque / Desembarque)
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Capture uma foto e descreva qualquer situação observada durante a operação para
            integrar automaticamente ao relatório oficial.
          </p>
        </div>

        <form onSubmit={handleSubmitOccurrence} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="occ-phase" className="block text-xs font-semibold text-slate-700 mb-1">
                Etapa da Operação
              </label>
              <select
                id="occ-phase"
                value={phase}
                onChange={(e) => setPhase(e.target.value as OccurrencePhase)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm"
              >
                <option value="embarque">Embarque</option>
                <option value="desembarque">Desembarque</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="occ-severity"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Classificação
              </label>
              <select
                id="occ-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as OccurrenceSeverity)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm"
              >
                <option value="informativo">Informativo</option>
                <option value="atencao">Atenção</option>
                <option value="critico">Crítico</option>
              </select>
            </div>

            <div>
              <label htmlFor="occ-fleet" className="block text-xs font-semibold text-slate-700 mb-1">
                Frota Relacionada (opcional)
              </label>
              <select
                id="occ-fleet"
                value={fleetCode}
                onChange={(e) => setFleetCode(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-mono"
              >
                <option value="">Ocorrência geral da balsa</option>
                {fleets.map((f) => (
                  <option key={f.id} value={f.chassiIdentificador}>
                    {f.chassiIdentificador} — {f.descricaoCarga}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8 space-y-3">
              <div>
                <label htmlFor="occ-title" className="block text-xs font-semibold text-slate-700 mb-1">
                  Título da Situação
                </label>
                <input
                  id="occ-title"
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (formError) setFormError(null);
                    if (formSavedMsg) setFormSavedMsg(null);
                  }}
                  placeholder="Ex.: Avaria em lona na entrada da rampa / Ajuste de cinta"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900"
                />
              </div>

              <div>
                <label htmlFor="occ-desc" className="block text-xs font-semibold text-slate-700 mb-1">
                  Descrição Detalhada
                </label>
                <textarea
                  id="occ-desc"
                  rows={3}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    if (formError) setFormError(null);
                    if (formSavedMsg) setFormSavedMsg(null);
                  }}
                  placeholder="Descreva o ocorrido, providência adotada e responsáveis..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900"
                />
              </div>
            </div>

            <div className="lg:col-span-4 flex flex-col justify-between gap-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">Evidência Fotográfica</p>
                {photoDataUrl ? (
                  <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-white">
                    <img
                      src={photoDataUrl}
                      alt="Pré-visualização da foto da ocorrência"
                      referrerPolicy="no-referrer"
                      className="w-full h-32 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotoDataUrl(undefined)}
                      className="absolute top-1.5 right-1.5 px-2 py-1 rounded bg-slate-900/80 text-white text-[11px] font-semibold cursor-pointer"
                    >
                      Remover
                    </button>
                  </div>
                ) : (
                  <div className="h-32 rounded-lg border border-dashed border-slate-300 bg-white flex flex-col items-center justify-center gap-1.5 text-slate-400 text-xs">
                    <ImageIcon className="w-5 h-5" aria-hidden="true" />
                    <span>Nenhuma foto anexada</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 min-h-[44px] cursor-pointer"
              >
                <Camera className="w-4 h-4" aria-hidden="true" />
                <span>{photoDataUrl ? 'Trocar Foto' : 'Bater Foto / Anexar'}</span>
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                aria-label="Capturar ou anexar foto da ocorrência"
                onChange={handlePhotoSelect}
              />
            </div>
          </div>

          {formError && <p className="text-xs font-semibold text-red-600">{formError}</p>}
          {formSavedMsg && (
            <p role="status" className="text-xs font-semibold text-emerald-700">
              {formSavedMsg}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F5B7C] hover:bg-[#0c4a66] text-white text-sm font-bold min-h-[44px] cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" aria-hidden="true" />
              <span>Registrar Ocorrência no Relatório</span>
            </button>
          </div>
        </form>
      </section>

      {aiError && (
        <div
          role="alert"
          className="no-print rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800"
        >
          {aiError}
        </div>
      )}

      {/* Printable Official Operational Dossier */}
      <article
        aria-label="Relatório completo da operação"
        className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-8"
      >
        {/* Dossier Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div className="space-y-1">
            <TblLogo variant="dark" size="md" />
            <h2 className="text-xl font-extrabold text-slate-900 pt-2">
              Relatório Oficial — Operação Carreteira
            </h2>
            <p className="text-xs text-slate-600">
              {[
                specs.name || 'Balsa não informada',
                specs.blsCode ? `BLS ${specs.blsCode}` : null,
                specs.emCode ? `EM ${specs.emCode}` : null,
                specs.route || null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>

          <div className="text-left sm:text-right text-xs text-slate-600 space-y-1 tabular-nums">
            <p className="font-semibold text-slate-900">
              Emissão: {new Date().toLocaleDateString('pt-BR')} às{' '}
              {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
            {specs.riverCondition && <p>Condição Fluvial: {specs.riverCondition}</p>}
            <p>Desenvolvido por: Emmili O. Gonçalves</p>
          </div>
        </header>

        {/* AI Executive Report Section */}
        {aiReport && (
          <section className="print-break-avoid bg-sky-50/70 border border-sky-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-[#0F5B7C]">
                Parecer Operacional Assistido por IA
              </h3>
              <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                {new Date(aiReport.generatedAt).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <p className="text-sm text-slate-800 leading-relaxed">{aiReport.resumoExecutivo}</p>
            <p className="text-xs text-slate-700 leading-relaxed">
              <strong className="text-slate-900">Estabilidade:</strong>{' '}
              {aiReport.parecerEstabilidade}
            </p>
            {aiReport.pontosAtencao.length > 0 && (
              <ul className="list-disc pl-4 text-xs text-slate-700 space-y-1">
                {aiReport.pontosAtencao.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
            <p className="text-xs font-semibold text-[#0F5B7C] pt-1">
              Recomendação de Viagem: {aiReport.recomendacaoViagem}
            </p>
          </section>
        )}

        {/* Balance Analysis Summary */}
        <section className="print-break-avoid space-y-3">
          <h3 className="text-base font-bold text-slate-900">
            01. Análise de Equilíbrio e Capacidade
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border border-slate-200 rounded-xl p-4 bg-slate-50/60">
            <div>
              <p className="text-xs text-slate-500">Situação da Balsa</p>
              <div className="flex items-center gap-1.5 mt-1">
                {balance.status === 'critico' ? (
                  <AlertTriangle className="w-4 h-4 text-red-600" aria-hidden="true" />
                ) : balance.status === 'atencao' ? (
                  <Scale className="w-4 h-4 text-amber-600" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                )}
                <span className="text-sm font-bold text-slate-900 capitalize">
                  {balance.status}
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500">Peso Estivado</p>
              <p className="text-sm font-mono font-bold tabular-nums text-slate-900 mt-1">
                {formatWeightTons(balance.totalWeightKg)} ({balance.utilizationPct.toFixed(1)}%)
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Desvio Proa / Popa</p>
              <p className="text-sm font-mono font-bold tabular-nums text-slate-900 mt-1">
                {balance.longitudinalImbalancePct.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Desvio BB / BE</p>
              <p className="text-sm font-mono font-bold tabular-nums text-slate-900 mt-1">
                {balance.transversalImbalancePct.toFixed(1)}%
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-600 tabular-nums">
            Proa: {formatWeightTons(balance.bowWeightKg)} · Popa:{' '}
            {formatWeightTons(balance.sternWeightKg)} · Bombordo:{' '}
            {formatWeightTons(balance.portWeightKg)} · Boreste:{' '}
            {formatWeightTons(balance.starboardWeightKg)}
          </p>
        </section>

        {/* Ready Stowage Map Visual */}
        <section className="print-break-avoid space-y-3">
          <h3 className="text-base font-bold text-slate-900">
            02. Mapa de Estivagem Pronto ({balance.placedCount} carretas posicionadas)
          </h3>
          <div className="overflow-x-auto">
            <div className="min-w-[660px] flex items-stretch gap-2 bg-sky-50/70 border border-sky-200 rounded-2xl p-3">
              <div className="flex-1 space-y-1.5">
                {Array.from({ length: specs.rows }, (_, row) => (
                  <div key={row} className="flex items-center gap-1.5">
                    <span className="w-4 text-[10px] font-mono font-bold text-slate-500">
                      {LANE_LETTERS[row]}
                    </span>
                    <div
                      className="flex-1 grid gap-1.5"
                      style={{ gridTemplateColumns: `repeat(${specs.cols}, minmax(0, 1fr))` }}
                    >
                      {Array.from({ length: specs.cols }, (_, col) => {
                        const f = slotMap.get(`${row}:${col}`);
                        return (
                          <div
                            key={`${row}-${col}`}
                            className={`h-12 rounded-lg border px-1.5 py-1 flex flex-col justify-between text-[10px] ${
                              f
                                ? f.status === 'embarcada'
                                  ? 'bg-[#0F5B7C] border-[#0a3e54] text-white'
                                  : 'bg-white border-sky-400 text-slate-900'
                                : 'bg-white/60 border-slate-200 text-slate-400'
                            }`}
                          >
                            {f ? (
                              <>
                                <span className="font-mono font-bold truncate">
                                  {f.chassiIdentificador}
                                </span>
                                <span
                                  className={`font-mono tabular-nums ${
                                    f.status === 'embarcada' ? 'text-[#FACC15]' : 'text-slate-600'
                                  }`}
                                >
                                  {formatWeightTons(f.pesoTotalKg)}
                                </span>
                              </>
                            ) : (
                              <span className="font-mono opacity-60">
                                {LANE_LETTERS[row]}
                                {col + 1}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="w-9 rounded-xl bg-[#FACC15] border border-amber-500 flex items-center justify-center shrink-0">
                <span
                  className="text-[11px] font-extrabold tracking-widest text-slate-950"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                  RAMPA
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Boarded & Waiting Fleets Table */}
        <section className="space-y-3">
          <h3 className="text-base font-bold text-slate-900">
            03. Relação de Frotas Embarcadas ({boardedFleets.length}) e Pendentes (
            {waitingFleets.length})
          </h3>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">Chassi / Placa</th>
                  <th className="py-2.5 px-3">Veículo</th>
                  <th className="py-2.5 px-3">Descrição Carga</th>
                  <th className="py-2.5 px-3">Posição</th>
                  <th className="py-2.5 px-3 text-right">Peso Total</th>
                  <th className="py-2.5 px-3">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fleets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 px-3 text-center text-slate-500">
                      Nenhuma frota cadastrada na operação até o momento.
                    </td>
                  </tr>
                ) : (
                  fleets.map((f) => (
                    <tr key={f.id}>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {f.chassiIdentificador}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{f.veiculo || '—'}</td>
                      <td className="py-2.5 px-3 text-slate-700">{f.descricaoCarga}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {f.mapPosition
                          ? `${LANE_LETTERS[f.mapPosition.row]}${f.mapPosition.col + 1}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-right tabular-nums text-slate-900">
                        {formatWeightKg(f.pesoTotalKg)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold">
                        {f.status === 'embarcada' ? (
                          <span className="text-emerald-700">Embarcada</span>
                        ) : (
                          <span className="text-amber-700">Aguardando</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Occurrences Log */}
        <section className="space-y-3">
          <h3 className="text-base font-bold text-slate-900">
            04. Ocorrências de Embarque e Desembarque ({occurrences.length})
          </h3>

          {occurrences.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nenhuma ocorrência registrada até o momento.
            </p>
          ) : (
            <div className="space-y-3">
              {occurrences.map((occ) => (
                <div
                  key={occ.id}
                  className="print-break-avoid border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4 justify-between"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-bold text-slate-900 capitalize">{occ.phase}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-semibold capitalize ${
                          occ.severity === 'critico'
                            ? 'text-red-700'
                            : occ.severity === 'atencao'
                              ? 'text-amber-700'
                              : 'text-sky-700'
                        }`}
                      >
                        {occ.severity}
                      </span>
                      {occ.fleetCode && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono font-semibold text-slate-700">
                            Frota {occ.fleetCode}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {new Date(occ.timestamp).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900">{occ.title}</h4>
                    <p className="text-sm text-slate-700 leading-relaxed">{occ.description}</p>
                  </div>

                  <div className="flex items-start gap-3 shrink-0">
                    {occ.photoDataUrl && (
                      <img
                        src={occ.photoDataUrl}
                        alt={`Registro fotográfico: ${occ.title}`}
                        referrerPolicy="no-referrer"
                        className="w-28 h-20 object-cover rounded-lg border border-slate-200"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteOccurrence(occ.id)}
                      aria-label={`Excluir ocorrência ${occ.title}`}
                      className="no-print p-2 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </article>
    </div>
  );
};
