import React from 'react';
import { ArrowRight } from 'lucide-react';
import { TblLogo } from './TblLogo';
import type { BargeSpecs } from '../types/operation';

interface SplashScreenProps {
  specs: BargeSpecs;
  boardedCount: number;
  totalFleets: number;
  onEnter: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  specs,
  boardedCount,
  totalFleets,
  onEnter,
}) => {
  const vesselMeta = [
    specs.name || 'Nova Operação Carreteira',
    specs.blsCode ? `BLS ${specs.blsCode}` : null,
    specs.emCode ? `EM ${specs.emCode}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="min-h-screen w-full bg-[#146082] text-white flex flex-col justify-between px-6 py-10 relative overflow-hidden">
      {/* Subtle geometric water contour lines */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            'radial-gradient(circle at 80% 15%, rgba(125,211,252,0.45), transparent 45%), radial-gradient(circle at 15% 85%, rgba(250,204,21,0.25), transparent 40%)',
        }}
      />

      <div className="relative z-10 max-w-5xl w-full mx-auto flex items-center justify-between text-xs text-sky-100/90">
        <span>{vesselMeta}</span>
        <span className="tabular-nums">
          {totalFleets === 0
            ? 'Nenhuma frota cadastrada'
            : `${boardedCount} de ${totalFleets} frotas embarcadas`}
        </span>
      </div>

      <main className="relative z-10 max-w-2xl mx-auto text-center flex flex-col items-center gap-6 my-auto py-12">
        <TblLogo variant="light" size="lg" />

        <div className="space-y-3">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-[#FACC15] leading-tight">
            TBL App
            <span className="block text-2xl sm:text-4xl mt-1">
              Operação Carreteira
            </span>
          </h1>
          <p className="text-sky-100 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            Gestão inteligente de embarque fluvial em balsas com leitura de placas por IA,
            conferência de manifestos, equilíbrio de estivagem e relatórios operacionais.
          </p>
        </div>

        <div className="pt-4">
          <button
            type="button"
            onClick={onEnter}
            className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl bg-[#FACC15] text-slate-950 font-bold text-base hover:bg-yellow-300 active:scale-[0.98] transition-all shadow-lg shadow-slate-950/20 min-h-[48px] whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <span>Abrir Painel de Funções</span>
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </main>

      <footer className="relative z-10 max-w-5xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-sky-100/80 border-t border-white/15 pt-5">
        <span>
          Transportes Bertolini Ltda.{specs.route ? ` · Rota ${specs.route}` : ''}
        </span>
        <span>Desenvolvido por: Emmili O. Gonçalves</span>
      </footer>
    </div>
  );
};
