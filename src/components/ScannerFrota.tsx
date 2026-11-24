import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  X,
  Upload,
  Keyboard,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  RefreshCw,
  ArrowLeft,
  Truck,
} from 'lucide-react';
import type { FleetRecord, ScanLogEntry } from '../types/operation';
import {
  findFleetByCode,
  formatWeightTons,
  normalizeIdentifier,
} from '../utils/balanceEngine';

interface ScannerFrotaProps {
  fleets: FleetRecord[];
  scanLogs: ScanLogEntry[];
  onAuthorizeBoard: (fleetId: string, method: 'ia_camera' | 'manual', scannedCode: string) => void;
  onLogUnauthorized: (scannedCode: string, method: 'ia_camera' | 'manual') => void;
}

type ScannerMode = 'camera' | 'review' | 'manual';

interface PendingScan {
  scannedCode: string;
  matchedFleet?: FleetRecord;
  method: 'ia_camera' | 'manual';
  confidence?: string;
  notes?: string;
}

export const ScannerFrota: React.FC<ScannerFrotaProps> = ({
  fleets,
  scanLogs,
  onAuthorizeBoard,
  onLogUnauthorized,
}) => {
  const [mode, setMode] = useState<ScannerMode>('camera');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'danger';
    message: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    setAiError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          'Câmera não disponível neste navegador. Use "Enviar Foto da Placa" ou "Inserir Manualmente".',
        );
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setCameraError(
        'Não foi possível acessar a câmera (permissão negada ou dispositivo sem câmera). Envie uma foto da placa ou digite manualmente.',
      );
    }
  };

  const evaluateScannedCode = (
    rawCode: string,
    method: 'ia_camera' | 'manual',
    confidence?: string,
    notes?: string,
  ) => {
    const clean = normalizeIdentifier(rawCode);
    const matched = findFleetByCode(fleets, clean);
    setPendingScan({
      scannedCode: clean || 'NÃO IDENTIFICADO',
      matchedFleet: matched,
      method,
      confidence,
      notes,
    });
    setMode('review');
    setFeedbackBanner(null);
  };

  const runAiScanOnImage = async (imageBase64: string, mimeType: string) => {
    setScanning(true);
    setAiError(null);
    try {
      const response = await fetch('/api/ai/scan-plate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao analisar placa com IA.');
      }
      if (!data.detectedCode) {
        setAiError(
          data.notes ||
            'A IA não identificou uma placa legível na foto. Tente aproximar a câmera ou insira manualmente.',
        );
        return;
      }
      evaluateScannedCode(data.detectedCode, 'ia_camera', data.confidence, data.notes);
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Falha na comunicação com o serviço de visão IA.',
      );
    } finally {
      setScanning(false);
    }
  };

  const handleCaptureFrame = async () => {
    if (!videoRef.current || !cameraActive) {
      await startCamera();
      return;
    }
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 960;
    canvas.height = video.videoHeight || 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.split(',')[1];
    await runAiScanOnImage(base64, 'image/jpeg');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      await runAiScanOnImage(base64, file.type || 'image/jpeg');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleConfirmReading = () => {
    if (!pendingScan) return;
    if (pendingScan.matchedFleet) {
      onAuthorizeBoard(
        pendingScan.matchedFleet.id,
        pendingScan.method,
        pendingScan.scannedCode,
      );
      setFeedbackBanner({
        type: 'success',
        message: `Frota ${pendingScan.matchedFleet.chassiIdentificador} (${pendingScan.matchedFleet.descricaoCarga}) confirmada e registrada como EMBARCADA no plano.`,
      });
    } else {
      onLogUnauthorized(pendingScan.scannedCode, pendingScan.method);
      setFeedbackBanner({
        type: 'danger',
        message: `Frota ${pendingScan.scannedCode} NÃO está no plano de embarque — retirada da fila registrada.`,
      });
    }
    setPendingScan(null);
    setMode('camera');
  };

  const handleRejectReading = () => {
    setManualInput(
      pendingScan?.scannedCode && pendingScan.scannedCode !== 'NÃO IDENTIFICADO'
        ? pendingScan.scannedCode
        : '',
    );
    setManualError(null);
    setMode('manual');
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeIdentifier(manualInput);
    if (!cleaned || cleaned.length < 3) {
      setManualError('Informe uma placa ou código de frota válido (mínimo 3 caracteres).');
      return;
    }
    setManualError(null);
    evaluateScannedCode(cleaned, 'manual');
  };

  const waitingFleets = fleets.filter((f) => f.status === 'aguardando');
  const isAuthorized = Boolean(pendingScan?.matchedFleet);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Scanner de Frota</h1>
          <p className="text-sm text-slate-600 mt-1">
            Valide carretas na entrada da rampa via câmera com visão IA ou confirmação manual.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMode('manual');
              setManualInput('');
              setManualError(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 min-h-[44px] whitespace-nowrap cursor-pointer"
          >
            <Keyboard className="w-4 h-4" aria-hidden="true" />
            <span>Inserir Manualmente</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F5B7C] text-white text-sm font-semibold hover:bg-[#0c4a66] min-h-[44px] whitespace-nowrap cursor-pointer"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            <span>Enviar Foto da Placa</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            aria-label="Selecionar foto da placa para leitura por IA"
            onChange={handleFileUpload}
          />
        </div>
      </div>

      {feedbackBanner && (
        <div
          role="status"
          className={`rounded-xl px-5 py-4 border flex items-center justify-between gap-4 ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          <div className="flex items-center gap-3 text-sm font-medium">
            {feedbackBanner.type === 'success' ? (
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" aria-hidden="true" />
            )}
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            aria-label="Fechar aviso"
            className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Primary Column: Faithful TBL Scanner Frame */}
        <section className="lg:col-span-7 bg-[#38ADE0]/15 border border-sky-200 rounded-2xl p-5 sm:p-6 space-y-5">
          {mode === 'manual' ? (
            /* Page 5 & 6: MANUALMENTE / INSERIR A FROTA MANUALMENTE */
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#0F5B7C]">Conferência Manual</p>
                  <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                    Inserir a Frota Manualmente
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMode('camera');
                    setPendingScan(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 min-h-[44px] cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  <span>Voltar à câmera</span>
                </button>
              </div>

              <form onSubmit={handleManualSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="manual-fleet-input"
                    className="block text-sm font-semibold text-slate-800 mb-2"
                  >
                    Placa (Chassi/Identificador) ou Código do Veículo
                  </label>
                  <input
                    id="manual-fleet-input"
                    type="text"
                    value={manualInput}
                    onChange={(e) => {
                      setManualInput(e.target.value.toUpperCase());
                      if (manualError) setManualError(null);
                    }}
                    placeholder="Ex.: DBC1891, JWF7712 ou 8477"
                    className="w-full px-4 py-3.5 text-lg font-mono font-bold tracking-wider uppercase rounded-xl border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:border-[#0284C7] focus:outline-none"
                    autoFocus
                  />
                  {manualError && (
                    <p className="text-xs font-medium text-red-600 mt-2">{manualError}</p>
                  )}
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Ao informar a frota manualmente, o sistema consulta imediatamente o plano de
                  embarque: se estiver cadastrada, libera a entrada; caso contrário, indica não
                  autorizada.
                </p>

                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base transition-colors min-h-[48px] cursor-pointer"
                >
                  <Check className="w-5 h-5" aria-hidden="true" />
                  <span>Verificar Frota no Plano</span>
                </button>
              </form>
            </div>
          ) : (
            /* Pages 3, 4, 5, 6: Scanner de Frotas Viewfinder + Green/Red Overlay */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[#0F5B7C]">
                  Visor do Scanner com IA
                </h2>
                {cameraActive ? (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer"
                  >
                    Desligar câmera
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="text-xs font-semibold text-[#0F5B7C] hover:underline cursor-pointer"
                  >
                    Ativar câmera ao vivo
                  </button>
                )}
              </div>

              {/* Camera / Review Frame with Red (unauthorized) or Green (authorized) border */}
              <div
                className={`relative rounded-2xl overflow-hidden bg-slate-950 min-h-[340px] sm:min-h-[390px] flex flex-col items-center justify-center transition-colors border-4 ${
                  mode === 'review'
                    ? isAuthorized
                      ? 'border-emerald-500'
                      : 'border-red-600'
                    : 'border-slate-800'
                }`}
              >
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`absolute inset-0 w-full h-full object-cover ${
                    cameraActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                />

                {!cameraActive && mode === 'camera' && !scanning && (
                  <div className="relative z-10 text-center px-6 py-8 max-w-sm space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-white/10 text-sky-300 flex items-center justify-center mx-auto">
                      <Camera className="w-8 h-8" aria-hidden="true" />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-white font-semibold text-base">
                        Aponte para a placa da carreta
                      </p>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Ative a câmera para captura ao vivo com Gemini Vision ou envie uma foto
                        da placa para validação instantânea.
                      </p>
                    </div>
                  </div>
                )}

                {scanning && (
                  <div className="relative z-20 bg-slate-950/85 backdrop-blur-sm inset-0 absolute flex flex-col items-center justify-center gap-3 text-white p-6">
                    <Loader2 className="w-9 h-9 animate-spin text-sky-400" aria-hidden="true" />
                    <p className="font-semibold text-sm">
                      Lendo placa / identificador com IA...
                    </p>
                  </div>
                )}

                {/* Pages 4, 5, 6 Result Overlay */}
                {mode === 'review' && pendingScan && (
                  <div className="relative z-20 w-full h-full bg-slate-950/85 backdrop-blur-xs p-5 sm:p-7 flex flex-col items-center justify-center gap-5 text-center">
                    <div
                      className={`w-full max-w-md rounded-xl px-5 py-4 border-2 ${
                        isAuthorized
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
                          : 'bg-red-50 border-red-500 text-red-950'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2 font-extrabold text-xl tracking-tight">
                        {isAuthorized ? (
                          <ShieldCheck className="w-6 h-6 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <ShieldAlert className="w-6 h-6 text-red-600" aria-hidden="true" />
                        )}
                        <span>
                          {isAuthorized ? 'FROTA AUTORIZADA' : 'NÃO ESTÁ CADASTRADA'}
                        </span>
                      </div>
                      {pendingScan.matchedFleet ? (
                        <p className="text-xs font-medium text-emerald-800 mt-1.5">
                          {pendingScan.matchedFleet.descricaoCarga} ·{' '}
                          {formatWeightTons(pendingScan.matchedFleet.pesoTotalKg)} ·{' '}
                          {pendingScan.matchedFleet.unidadeDestino}
                          {pendingScan.matchedFleet.status === 'embarcada'
                            ? ' (Já consta como embarcada)'
                            : ''}
                        </p>
                      ) : (
                        <p className="text-xs font-medium text-red-800 mt-1.5">
                          Esta frota não consta no plano de embarque e deve ser retirada da fila.
                        </p>
                      )}
                    </div>

                    <div className="w-full max-w-md rounded-xl bg-sky-500/20 border border-sky-300/40 px-4 py-3 text-white space-y-1">
                      <p className="text-xs text-sky-200">Número escaneado</p>
                      <p className="text-2xl font-mono font-extrabold tracking-widest text-white">
                        {pendingScan.scannedCode}
                      </p>
                      <p className="text-sm font-semibold text-sky-100 pt-1">
                        A leitura está correta?
                      </p>
                      {pendingScan.notes && (
                        <p className="text-xs text-sky-200/90 pt-0.5">{pendingScan.notes}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-center gap-4 w-full max-w-md">
                      <button
                        type="button"
                        onClick={handleConfirmReading}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm min-h-[48px] cursor-pointer transition-colors"
                      >
                        <Check className="w-5 h-5" aria-hidden="true" />
                        <span>
                          {isAuthorized ? 'Sim, Embarcar Frota' : 'Sim, Retirar da Fila'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handleRejectReading}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm min-h-[48px] cursor-pointer transition-colors"
                      >
                        <X className="w-5 h-5" aria-hidden="true" />
                        <span>Não, Corrigir</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {cameraError && (
                <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  {cameraError}
                </p>
              )}
              {aiError && (
                <p className="text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  {aiError}
                </p>
              )}

              {/* Signature Capture Button matching PDF Page 3-6 */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  disabled={scanning}
                  onClick={handleCaptureFrame}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-[#0F5B7C] hover:bg-[#0c4a66] disabled:opacity-60 text-white font-bold text-sm min-h-[48px] cursor-pointer transition-colors"
                >
                  <Camera className="w-5 h-5" aria-hidden="true" />
                  <span>
                    {cameraActive ? 'Capturar e Ler Placa com IA' : 'Ativar Câmera do Scanner'}
                  </span>
                </button>

                {mode === 'review' && (
                  <button
                    type="button"
                    onClick={() => {
                      setPendingScan(null);
                      setMode('camera');
                    }}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 min-h-[44px] px-3 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" aria-hidden="true" />
                    <span>Nova leitura</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Right Column: Waiting Queue & Recent Scan Log */}
        <aside className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Fila Aguardando Embarque ({waitingFleets.length})
              </h2>
              <span className="text-xs text-slate-500">Plano atual</span>
            </div>

            {waitingFleets.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">
                {fleets.length === 0
                  ? 'Nenhuma frota cadastrada no plano de embarque ainda.'
                  : 'Todas as frotas cadastradas no plano já foram embarcadas.'}
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {waitingFleets.map((fleet) => (
                  <div
                    key={fleet.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-[#0F5B7C] shrink-0" aria-hidden="true" />
                        <span className="font-mono font-bold text-sm text-slate-900">
                          {fleet.chassiIdentificador}
                        </span>
                        {fleet.veiculo && (
                          <span className="text-xs font-mono text-slate-500">
                            · Veíc. {fleet.veiculo}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 truncate mt-0.5">
                        {fleet.descricaoCarga} · {formatWeightTons(fleet.pesoTotalKg)}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-amber-700 whitespace-nowrap shrink-0">
                      Aguardando
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900">
              Últimas Leituras ({scanLogs.length})
            </h2>
            {scanLogs.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma leitura registrada ainda.</p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {scanLogs.slice(0, 8).map((log) => (
                  <div key={log.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">
                          {log.scannedCode}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span
                          className={
                            log.outcome === 'autorizada'
                              ? 'font-semibold text-emerald-700'
                              : 'font-semibold text-red-700'
                          }
                        >
                          {log.outcome === 'autorizada' ? 'Autorizada' : 'Não cadastrada'}
                        </span>
                      </div>
                      <p className="text-slate-600 truncate">{log.note}</p>
                    </div>
                    <span className="font-mono tabular-nums text-slate-400 shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
