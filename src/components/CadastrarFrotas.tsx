import React, { useMemo, useRef, useState } from 'react';
import {
  Camera,
  FileUp,
  CheckCircle2,
  Plus,
  Trash2,
  Loader2,
  Search,
  ArrowRight,
  AlertCircle,
  ClipboardCheck,
} from 'lucide-react';
import type {
  BargeSpecs,
  FleetRecord,
  PendingManifestFleet,
} from '../types/operation';
import {
  formatWeightKg,
  formatWeightTons,
  normalizeIdentifier,
  parseBrazilianWeightKg,
} from '../utils/balanceEngine';

interface CadastrarFrotasProps {
  specs: BargeSpecs;
  fleets: FleetRecord[];
  onConfirmBatch: (verified: PendingManifestFleet[]) => number;
  onDeleteFleet: (fleetId: string) => void;
  onGoToMap: () => void;
}

export const CadastrarFrotas: React.FC<CadastrarFrotasProps> = ({
  specs,
  fleets,
  onConfirmBatch,
  onDeleteFleet,
  onGoToMap,
}) => {
  const [pendingBatch, setPendingBatch] = useState<PendingManifestFleet[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractNote, setExtractNote] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todas' | 'aguardando' | 'embarcada'>('todas');

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processFileWithAi = async (file: File) => {
    setExtracting(true);
    setExtractError(null);
    setConfirmSuccess(null);

    try {
      const isTextLike =
        file.type === 'text/csv' ||
        file.type === 'text/plain' ||
        file.name.toLowerCase().endsWith('.csv') ||
        file.name.toLowerCase().endsWith('.txt');

      let bodyPayload: Record<string, string> = {};
      if (isTextLike) {
        const rawText = await file.text();
        bodyPayload = { rawText };
      } else {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
          reader.readAsDataURL(file);
        });
        bodyPayload = {
          fileBase64: dataUrl.split(',')[1],
          mimeType: file.type || 'image/jpeg',
        };
      }

      const response = await fetch('/api/ai/extract-manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao ler manifesto com IA.');
      }

      const extracted: PendingManifestFleet[] = (data.fleets ?? []).map(
        (item: Record<string, unknown>, idx: number) => ({
          tempId: `ext-${Date.now()}-${idx}`,
          unidadeDestino: String(item.unidadeDestino ?? 'NAV MAO (48)'),
          veiculo: String(item.veiculo ?? ''),
          chassiIdentificador: normalizeIdentifier(String(item.chassiIdentificador ?? '')),
          descricaoCarga: String(item.descricaoCarga ?? ''),
          pesoCargaKg: parseBrazilianWeightKg(item.pesoCargaKg as string | number),
          pesoTotalKg: parseBrazilianWeightKg(item.pesoTotalKg as string | number),
          bls: String(item.bls ?? specs.blsCode),
          em: String(item.em ?? specs.emCode),
          checked: false,
        }),
      );

      if (extracted.length === 0) {
        setExtractError(
          'Nenhuma linha de frota foi detectada no arquivo. Verifique a nitidez da foto ou adicione manualmente.',
        );
        return;
      }

      setPendingBatch(extracted);
      setExtractNote(
        data.summaryNote ||
          `${extracted.length} frotas extraídas pela IA. Confira e dê check em cada linha antes de confirmar.`,
      );
    } catch (err) {
      setExtractError(
        err instanceof Error ? err.message : 'Falha na extração inteligente do manifesto.',
      );
    } finally {
      setExtracting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processFileWithAi(file);
    }
    e.target.value = '';
  };

  const handleAddManualRow = () => {
    setExtractError(null);
    setConfirmSuccess(null);
    setPendingBatch((prev) => [
      ...prev,
      {
        tempId: `manual-${Date.now()}`,
        unidadeDestino: '',
        veiculo: '',
        chassiIdentificador: '',
        descricaoCarga: '',
        pesoCargaKg: 0,
        pesoTotalKg: 0,
        bls: specs.blsCode,
        em: specs.emCode,
        checked: false,
      },
    ]);
  };

  const updatePendingField = <K extends keyof PendingManifestFleet>(
    tempId: string,
    field: K,
    value: PendingManifestFleet[K],
  ) => {
    setPendingBatch((prev) =>
      prev.map((row) =>
        row.tempId === tempId
          ? {
              ...row,
              [field]: value,
              // If user edits an already checked row, keep checked controllable
            }
          : row,
      ),
    );
  };

  const removePendingRow = (tempId: string) => {
    setPendingBatch((prev) => prev.filter((row) => row.tempId !== tempId));
  };

  const checkedCount = pendingBatch.filter((r) => r.checked).length;
  const allRowsValid = pendingBatch.every(
    (r) => normalizeIdentifier(r.chassiIdentificador).length >= 3 && r.pesoTotalKg > 0,
  );
  const canConfirm =
    pendingBatch.length > 0 && checkedCount === pendingBatch.length && allRowsValid;

  const handleConfirmRegistration = () => {
    if (!canConfirm) return;
    const addedCount = onConfirmBatch(pendingBatch);
    setPendingBatch([]);
    setExtractNote(null);
    setConfirmSuccess(
      `${addedCount} frota(s) conferida(s) e cadastrada(s) no plano de embarque. Você já pode readaptar o equilíbrio na Criação de Mapa.`,
    );
  };

  const filteredFleets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return fleets.filter((fleet) => {
      if (statusFilter !== 'todas' && fleet.status !== statusFilter) return false;
      if (!q) return true;
      return (
        fleet.chassiIdentificador.toLowerCase().includes(q) ||
        fleet.veiculo.toLowerCase().includes(q) ||
        fleet.descricaoCarga.toLowerCase().includes(q) ||
        fleet.unidadeDestino.toLowerCase().includes(q)
      );
    });
  }, [fleets, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Cadastrar Frotas</h1>
          <p className="text-sm text-slate-600 mt-1">
            Escaneie a folha de manifesto da expedição ou importe foto/arquivo com IA e dê check
            obrigatório em cada carreta antes de confirmar.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAddManualRow}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 min-h-[44px] whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Adicionar Linha Manual</span>
        </button>
      </div>

      {/* Page 7 Capture / Upload Panel */}
      <section className="bg-[#38ADE0]/12 border border-sky-200 rounded-2xl p-5 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-7 space-y-2">
            <h2 className="text-lg font-bold text-[#0F5B7C]">
              Leitura de Manifesto da Expedição por IA
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              Fotografe o papel enviado pela expedição ou carregue imagem, PDF ou planilha CSV.
              A IA extrai automaticamente Unidade Destino, Veículo, Chassi/Identificador, Carga,
              Peso Carga, Peso Total, BLS e EM.
            </p>
          </div>

          <div className="lg:col-span-5 flex flex-col sm:flex-row lg:flex-col xl:flex-row gap-3 justify-end">
            <button
              type="button"
              disabled={extracting}
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#0F5B7C] hover:bg-[#0c4a66] disabled:opacity-60 text-white font-semibold text-sm min-h-[46px] whitespace-nowrap cursor-pointer transition-colors"
            >
              {extracting ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Camera className="w-4 h-4" aria-hidden="true" />
              )}
              <span>Escanear Papel</span>
            </button>

            <button
              type="button"
              disabled={extracting}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-60 text-slate-900 font-semibold text-sm min-h-[46px] whitespace-nowrap cursor-pointer transition-colors"
            >
              <FileUp className="w-4 h-4" aria-hidden="true" />
              <span>Arquivo / Fotos</span>
            </button>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              aria-label="Fotografar papel do manifesto"
              onChange={handleFileChange}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.csv,.txt"
              className="hidden"
              aria-label="Importar foto, PDF ou CSV do manifesto"
              onChange={handleFileChange}
            />
          </div>
        </div>
      </section>

      {extractError && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex items-center gap-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" aria-hidden="true" />
          <span>{extractError}</span>
        </div>
      )}

      {confirmSuccess && (
        <div
          role="status"
          className="rounded-xl bg-emerald-50 border border-emerald-200 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2.5 text-sm font-medium text-emerald-900">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
            <span>{confirmSuccess}</span>
          </div>
          <button
            type="button"
            onClick={onGoToMap}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold whitespace-nowrap min-h-[40px] cursor-pointer"
          >
            <span>Equilibrar no Mapa</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Mandatory Operator Verification Screen (Page 7 requirement) */}
      {pendingBatch.length > 0 && (
        <section
          aria-label="Conferência obrigatória de frotas escaneadas"
          className="bg-white rounded-2xl border-2 border-[#0284C7] overflow-hidden"
        >
          <div className="bg-sky-50 px-5 py-4 border-b border-sky-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-[#0F5B7C]" aria-hidden="true" />
                <h2 className="text-base font-extrabold text-slate-900">
                  Conferência Obrigatória de Leitura
                </h2>
              </div>
              <p className="text-xs text-slate-700">
                {extractNote ||
                  'Verifique cada linha escaneada, corrija qualquer dígito se necessário e marque o check em TODAS as frotas para liberar a confirmação.'}
              </p>
            </div>
            <div className="text-sm font-mono font-bold tabular-nums text-[#0F5B7C] shrink-0">
              {checkedCount} de {pendingBatch.length} conferidas
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3 px-3 text-center">Check</th>
                  <th className="py-3 px-3">Unidade Destino</th>
                  <th className="py-3 px-3">Veículo</th>
                  <th className="py-3 px-3">Chassi / Placa</th>
                  <th className="py-3 px-3">Descrição Carga</th>
                  <th className="py-3 px-3 text-right">Peso Carga (kg)</th>
                  <th className="py-3 px-3 text-right">Peso Total (kg)</th>
                  <th className="py-3 px-3">BLS / EM</th>
                  <th className="py-3 px-3 text-center">Remover</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingBatch.map((row) => (
                  <tr
                    key={row.tempId}
                    className={row.checked ? 'bg-emerald-50/40' : 'bg-white'}
                  >
                    <td className="py-2.5 px-3 text-center">
                      <label className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={row.checked}
                          onChange={(e) =>
                            updatePendingField(row.tempId, 'checked', e.target.checked)
                          }
                          aria-label={`Conferir frota ${row.chassiIdentificador || 'nova linha'}`}
                          className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                        />
                      </label>
                    </td>
                    <td className="py-2.5 px-2">
                      <input
                        type="text"
                        value={row.unidadeDestino}
                        onChange={(e) =>
                          updatePendingField(row.tempId, 'unidadeDestino', e.target.value)
                        }
                        aria-label="Unidade destino"
                        className="w-28 px-2 py-1.5 rounded border border-slate-200 text-xs font-medium text-slate-900"
                      />
                    </td>
                    <td className="py-2.5 px-2">
                      <input
                        type="text"
                        value={row.veiculo}
                        onChange={(e) =>
                          updatePendingField(row.tempId, 'veiculo', e.target.value.toUpperCase())
                        }
                        aria-label="Código do veículo"
                        placeholder="—"
                        className="w-16 px-2 py-1.5 rounded border border-slate-200 font-mono text-xs text-slate-900"
                      />
                    </td>
                    <td className="py-2.5 px-2">
                      <input
                        type="text"
                        value={row.chassiIdentificador}
                        onChange={(e) =>
                          updatePendingField(
                            row.tempId,
                            'chassiIdentificador',
                            e.target.value.toUpperCase(),
                          )
                        }
                        aria-label="Chassi ou placa"
                        placeholder="ABC1D23"
                        className="w-24 px-2 py-1.5 rounded border border-slate-300 font-mono font-bold text-xs text-slate-900"
                      />
                    </td>
                    <td className="py-2.5 px-2">
                      <input
                        type="text"
                        value={row.descricaoCarga}
                        onChange={(e) =>
                          updatePendingField(row.tempId, 'descricaoCarga', e.target.value)
                        }
                        aria-label="Descrição da carga"
                        className="w-40 px-2 py-1.5 rounded border border-slate-200 text-xs text-slate-900"
                      />
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <input
                        type="number"
                        step="0.001"
                        value={row.pesoCargaKg || ''}
                        onChange={(e) =>
                          updatePendingField(
                            row.tempId,
                            'pesoCargaKg',
                            parseBrazilianWeightKg(e.target.value),
                          )
                        }
                        aria-label="Peso da carga em kg"
                        className="w-24 px-2 py-1.5 rounded border border-slate-200 font-mono tabular-nums text-right text-xs text-slate-900"
                      />
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <input
                        type="number"
                        step="0.001"
                        value={row.pesoTotalKg || ''}
                        onChange={(e) =>
                          updatePendingField(
                            row.tempId,
                            'pesoTotalKg',
                            parseBrazilianWeightKg(e.target.value),
                          )
                        }
                        aria-label="Peso total em kg"
                        className="w-24 px-2 py-1.5 rounded border border-slate-300 font-mono font-semibold tabular-nums text-right text-xs text-slate-900"
                      />
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="text"
                          value={row.bls}
                          onChange={(e) => updatePendingField(row.tempId, 'bls', e.target.value)}
                          aria-label="BLS"
                          placeholder="BLS"
                          className="w-12 px-1.5 py-1.5 rounded border border-slate-200 font-mono text-xs text-slate-900"
                        />
                        <span className="text-slate-400">/</span>
                        <input
                          type="text"
                          value={row.em}
                          onChange={(e) => updatePendingField(row.tempId, 'em', e.target.value)}
                          aria-label="EM"
                          placeholder="EM"
                          className="w-12 px-1.5 py-1.5 rounded border border-slate-200 font-mono text-xs text-slate-900"
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => removePendingRow(row.tempId)}
                        aria-label={`Remover linha ${row.chassiIdentificador || 'vazia'}`}
                        className="p-2 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-xs text-slate-600">
              {!allRowsValid
                ? 'Preencha Chassi/Placa e Peso Total (> 0) em todas as linhas.'
                : checkedCount < pendingBatch.length
                  ? `Faltam ${pendingBatch.length - checkedCount} linha(s) para dar check de conferência.`
                  : 'Todas as frotas foram conferidas. Pronto para gravar no plano de embarque.'}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPendingBatch([])}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-100 min-h-[44px] cursor-pointer"
              >
                Cancelar Lote
              </button>
              <button
                type="button"
                disabled={!canConfirm}
                onClick={handleConfirmRegistration}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold text-sm min-h-[44px] whitespace-nowrap cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span>Confirmar Cadastro no Plano</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Current Boarding Plan Table */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Plano de Embarque Cadastrado ({fleets.length} frotas)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              Peso total manifestado:{' '}
              {formatWeightTons(fleets.reduce((sum, f) => sum + f.pesoTotalKg, 0))} ·{' '}
              {fleets.filter((f) => f.status === 'embarcada').length} embarcadas
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar placa, carga ou veículo..."
                aria-label="Buscar frotas cadastradas"
                className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 w-full sm:w-60 focus:border-[#0284C7] focus:outline-none"
              />
            </div>

            <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'todas', label: 'Todas' },
                  { id: 'aguardando', label: 'Aguardando' },
                  { id: 'embarcada', label: 'Embarcadas' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Leva</th>
                <th className="py-3 px-4">Unidade Destino</th>
                <th className="py-3 px-4">Veículo</th>
                <th className="py-3 px-4">Chassi / Placa</th>
                <th className="py-3 px-4">Descrição Carga</th>
                <th className="py-3 px-4 text-right">Peso Carga</th>
                <th className="py-3 px-4 text-right">Peso Total</th>
                <th className="py-3 px-4">Situação</th>
                <th className="py-3 px-4 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredFleets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-slate-500">
                    {fleets.length === 0
                      ? 'Nenhuma frota cadastrada ainda. Escaneie o papel do manifesto, importe um arquivo ou clique em "Adicionar Linha Manual".'
                      : 'Nenhuma frota encontrada com os filtros atuais.'}
                  </td>
                </tr>
              ) : (
                filteredFleets.map((fleet) => (
                  <tr key={fleet.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-slate-500 tabular-nums">
                      L{fleet.waveNumber}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                      {fleet.unidadeDestino}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600">
                      {fleet.veiculo || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {fleet.chassiIdentificador}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">{fleet.descricaoCarga}</td>
                    <td className="py-3 px-4 font-mono text-xs text-right tabular-nums text-slate-600">
                      {formatWeightKg(fleet.pesoCargaKg)}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-right tabular-nums text-slate-900">
                      {formatWeightKg(fleet.pesoTotalKg)}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold whitespace-nowrap">
                      {fleet.status === 'embarcada' ? (
                        <span className="text-emerald-700">Embarcada</span>
                      ) : (
                        <span className="text-amber-700">Aguardando</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {fleet.status === 'embarcada' ? (
                        <span className="text-xs text-slate-400">Travada</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onDeleteFleet(fleet.id)}
                          aria-label={`Remover frota ${fleet.chassiIdentificador}`}
                          className="p-2 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
