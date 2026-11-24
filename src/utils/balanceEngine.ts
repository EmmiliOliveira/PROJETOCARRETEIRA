import type {
  BalanceAnalysis,
  BalanceStatus,
  BargeSpecs,
  FleetRecord,
  GridPosition,
  IndicativeZoneCell,
  WeightTier,
} from '../types/operation';

export function normalizeIdentifier(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

export function findFleetByCode(
  fleets: FleetRecord[],
  rawCode: string,
): FleetRecord | undefined {
  const normalized = normalizeIdentifier(rawCode);
  if (!normalized) return undefined;
  return fleets.find((fleet) => {
    const chassi = normalizeIdentifier(fleet.chassiIdentificador);
    const veiculo = normalizeIdentifier(fleet.veiculo);
    return (
      (chassi.length > 0 && chassi === normalized) ||
      (veiculo.length > 0 && veiculo === normalized)
    );
  });
}

/**
 * Parses Brazilian number formatting (e.g. "25.785,576" -> 25785.576) or standard decimals.
 */
export function parseBrazilianWeightKg(raw: string | number): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.max(0, raw) : 0;
  }
  const cleaned = raw.trim().replace(/[^\d.,-]/g, '');
  if (!cleaned) return 0;

  if (cleaned.includes(',') && cleaned.includes('.')) {
    // Brazilian style: dots as thousands, comma as decimal
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const val = Number.parseFloat(normalized);
    return Number.isFinite(val) ? Math.max(0, val) : 0;
  }
  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(',', '.');
    const val = Number.parseFloat(normalized);
    return Number.isFinite(val) ? Math.max(0, val) : 0;
  }
  // If multiple dots like "12.345.678" or single dot with 3 trailing digits and value < 100 like "25.785"
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    const val = Number.parseFloat(parts.join(''));
    return Number.isFinite(val) ? Math.max(0, val) : 0;
  }
  const val = Number.parseFloat(cleaned);
  return Number.isFinite(val) ? Math.max(0, val) : 0;
}

export function formatWeightKg(kg: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(kg)) + ' kg';
}

export function formatWeightTons(kg: number): string {
  return (
    new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(kg / 1000) + ' t'
  );
}

function slotCoordX(col: number, cols: number): number {
  if (cols <= 1) return 0;
  return (col / (cols - 1)) * 2 - 1; // -1 (Proa) to +1 (Popa/Rampa)
}

function slotCoordY(row: number, rows: number): number {
  if (rows <= 1) return 0;
  return (row / (rows - 1)) * 2 - 1; // -1 (Bombordo) to +1 (Boreste)
}

function targetCgX(specs: BargeSpecs): number {
  if (specs.trimPreference === 'popa_leve') return 0.06;
  if (specs.trimPreference === 'proa_leve') return -0.06;
  return 0;
}

export function calculateBalance(
  fleets: FleetRecord[],
  specs: BargeSpecs,
): BalanceAnalysis {
  const placed = fleets.filter(
    (f) =>
      f.mapPosition != null &&
      f.mapPosition.row >= 0 &&
      f.mapPosition.row < specs.rows &&
      f.mapPosition.col >= 0 &&
      f.mapPosition.col < specs.cols,
  );

  const maxCapacityKg = Math.max(1, specs.maxCapacityTons * 1000);
  const boardedCount = fleets.filter((f) => f.status === 'embarcada').length;

  if (placed.length === 0) {
    return {
      placedCount: 0,
      boardedCount,
      totalWeightKg: 0,
      maxCapacityKg,
      utilizationPct: 0,
      bowWeightKg: 0,
      sternWeightKg: 0,
      portWeightKg: 0,
      starboardWeightKg: 0,
      cgX: 0,
      cgY: 0,
      longitudinalImbalancePct: 0,
      transversalImbalancePct: 0,
      status: 'equilibrada',
      criticalFleetIds: [],
      recommendations: [
        'Nenhuma carreta posicionada no mapa. Arraste carretas ou clique em Equilibrar.',
      ],
    };
  }

  let totalWeightKg = 0;
  let momentX = 0;
  let momentY = 0;
  let bowWeightKg = 0;
  let sternWeightKg = 0;
  let portWeightKg = 0;
  let starboardWeightKg = 0;

  for (const fleet of placed) {
    const pos = fleet.mapPosition!;
    const w = Math.max(1, fleet.pesoTotalKg);
    const nx = slotCoordX(pos.col, specs.cols);
    const ny = slotCoordY(pos.row, specs.rows);

    totalWeightKg += w;
    momentX += w * nx;
    momentY += w * ny;

    if (nx < 0) bowWeightKg += w;
    else if (nx > 0) sternWeightKg += w;
    else {
      bowWeightKg += w / 2;
      sternWeightKg += w / 2;
    }

    if (ny < 0) portWeightKg += w;
    else if (ny > 0) starboardWeightKg += w;
    else {
      portWeightKg += w / 2;
      starboardWeightKg += w / 2;
    }
  }

  const cgX = momentX / totalWeightKg;
  const cgY = momentY / totalWeightKg;
  const longitudinalImbalancePct = Math.min(100, Math.abs(cgX - targetCgX(specs)) * 100);
  const transversalImbalancePct = Math.min(100, Math.abs(cgY) * 100);
  const utilizationPct = (totalWeightKg / maxCapacityKg) * 100;

  let status: BalanceStatus = 'equilibrada';
  if (
    longitudinalImbalancePct >= 15 ||
    transversalImbalancePct >= 15 ||
    utilizationPct > 100
  ) {
    status = 'critico';
  } else if (
    longitudinalImbalancePct >= 7 ||
    transversalImbalancePct >= 7 ||
    utilizationPct >= 90
  ) {
    status = 'atencao';
  }

  const criticalFleetIds: string[] = [];
  const recommendations: string[] = [];

  if (status === 'critico') {
    // Score each fleet by how strongly it pushes the CG in the direction of imbalance
    const errX = cgX - targetCgX(specs);
    const errY = cgY;
    const scored = placed
      .map((fleet) => {
        const pos = fleet.mapPosition!;
        const nx = slotCoordX(pos.col, specs.cols);
        const ny = slotCoordY(pos.row, specs.rows);
        const contribution =
          fleet.pesoTotalKg *
          (Math.max(0, nx * errX) * 1.4 + Math.max(0, ny * errY) * 1.8);
        return { id: fleet.id, contribution, weight: fleet.pesoTotalKg };
      })
      .sort((a, b) => b.contribution - a.contribution || b.weight - a.weight);

    const topCount = Math.min(3, Math.max(1, scored.filter((s) => s.contribution > 0).length));
    for (let i = 0; i < topCount; i++) {
      criticalFleetIds.push(scored[i].id);
    }

    if (utilizationPct > 100) {
      recommendations.push(
        `Capacidade máxima (${specs.maxCapacityTons} t) excedida. Retire carretas críticas antes da liberação.`,
      );
    }
    if (transversalImbalancePct >= 15) {
      const heavySide = cgY < 0 ? 'Bombordo (superior)' : 'Boreste (inferior)';
      const counterSide = cgY < 0 ? 'Boreste (inferior)' : 'Bombordo (superior)';
      recommendations.push(
        `Desequilíbrio transversal crítico para ${heavySide}. Contrapese no lado ${counterSide} ou avalie relocação das frotas críticas sinalizadas.`,
      );
    }
    if (longitudinalImbalancePct >= 15) {
      const heavyEnd = cgX < 0 ? 'Proa (esquerda)' : 'Popa / Rampa (direita)';
      const counterEnd = cgX < 0 ? 'Popa / Rampa (direita)' : 'Proa (esquerda)';
      recommendations.push(
        `Trim longitudinal crítico concentrado na ${heavyEnd}. Direcione próximas carretas pesadas para a ${counterEnd}.`,
      );
    }
  } else if (status === 'atencao') {
    if (transversalImbalancePct >= 7) {
      const counterSide = cgY < 0 ? 'Boreste' : 'Bombordo';
      recommendations.push(
        `Leve tendência transversal. Priorize o lado ${counterSide} para a próxima leva de carretas.`,
      );
    }
    if (longitudinalImbalancePct >= 7) {
      const counterEnd = cgX < 0 ? 'Popa (próximo à rampa)' : 'Proa';
      recommendations.push(
        `Ajuste fino de trim recomendado: posicione próximas cargas médias/pesadas em direção à ${counterEnd}.`,
      );
    }
  } else {
    recommendations.push(
      'Distribuição de peso dentro da faixa nominal de estabilidade operacional.',
    );
  }

  return {
    placedCount: placed.length,
    boardedCount,
    totalWeightKg,
    maxCapacityKg,
    utilizationPct,
    bowWeightKg,
    sternWeightKg,
    portWeightKg,
    starboardWeightKg,
    cgX,
    cgY,
    longitudinalImbalancePct,
    transversalImbalancePct,
    status,
    criticalFleetIds,
    recommendations,
  };
}

export function buildDefaultIndicativeMap(specs: BargeSpecs): IndicativeZoneCell[] {
  const cells: IndicativeZoneCell[] = [];
  const centerRow = (specs.rows - 1) / 2;
  const centerCol = (specs.cols - 1) / 2;

  for (let row = 0; row < specs.rows; row++) {
    for (let col = 0; col < specs.cols; col++) {
      const distRow = Math.abs(row - centerRow) / Math.max(1, centerRow);
      const distCol = Math.abs(col - centerCol) / Math.max(1, centerCol);
      const isRampCol = col === specs.cols - 1;
      const isRampCorner = isRampCol && (row === 0 || row === specs.rows - 1);

      let tier: WeightTier;
      let recommendedMinTons: number;
      let recommendedMaxTons: number;
      let rationale: string;

      if (isRampCorner) {
        tier = 'restrito';
        recommendedMinTons = 0;
        recommendedMaxTons = 14;
        rationale = 'Borda de manobra da rampa — reservar para unidades leves ou acesso.';
      } else if (distRow <= 0.55 && distCol <= 0.55) {
        tier = 'pesado';
        recommendedMinTons = 26;
        recommendedMaxTons = 38;
        rationale = 'Núcleo estrutural central — ideal para carretas acima de 26t.';
      } else if (distRow <= 0.85 && !isRampCol) {
        tier = 'medio';
        recommendedMinTons = 17;
        recommendedMaxTons = 26;
        rationale = 'Faixa intermediária de compensação longitudinal e transversal.';
      } else {
        tier = 'leve';
        recommendedMinTons = 8;
        recommendedMaxTons = 18;
        rationale = 'Extremidade de proa/popa ou borda — indicar cargas leves para preservar trim.';
      }

      cells.push({
        row,
        col,
        tier,
        recommendedMinTons,
        recommendedMaxTons,
        rationale,
      });
    }
  }
  return cells;
}

function tierPenalty(weightKg: number, cell?: IndicativeZoneCell): number {
  if (!cell) return 0;
  const tons = weightKg / 1000;
  if (cell.tier === 'restrito') {
    return tons > cell.recommendedMaxTons ? (tons - cell.recommendedMaxTons) * 0.04 : 0.02;
  }
  if (tons >= cell.recommendedMinTons && tons <= cell.recommendedMaxTons) {
    return 0;
  }
  const diff =
    tons < cell.recommendedMinTons
      ? cell.recommendedMinTons - tons
      : tons - cell.recommendedMaxTons;
  return diff * 0.004;
}

/**
 * Optimizes stowage map while strictly locking already-boarded (status === 'embarcada')
 * and operator-pinned (isPinned === true) fleets that already occupy a slot.
 */
export function optimizeStowageMap(
  fleets: FleetRecord[],
  specs: BargeSpecs,
  indicativeMap?: IndicativeZoneCell[],
): FleetRecord[] {
  const cloned = fleets.map((f) => ({
    ...f,
    mapPosition: f.mapPosition ? { ...f.mapPosition } : null,
  }));

  const indicativeLookup = new Map<string, IndicativeZoneCell>();
  if (indicativeMap) {
    for (const c of indicativeMap) {
      indicativeLookup.set(`${c.row}:${c.col}`, c);
    }
  }

  const occupied = new Set<string>();
  const fixedFleets: FleetRecord[] = [];
  const movableFleets: FleetRecord[] = [];

  for (const fleet of cloned) {
    const hasValidSlot =
      fleet.mapPosition != null &&
      fleet.mapPosition.row >= 0 &&
      fleet.mapPosition.row < specs.rows &&
      fleet.mapPosition.col >= 0 &&
      fleet.mapPosition.col < specs.cols;

    const isImmutable = (fleet.status === 'embarcada' || Boolean(fleet.isPinned)) && hasValidSlot;
    if (isImmutable) {
      const key = `${fleet.mapPosition!.row}:${fleet.mapPosition!.col}`;
      if (!occupied.has(key)) {
        occupied.add(key);
        fixedFleets.push(fleet);
        continue;
      }
    }
    fleet.mapPosition = null;
    movableFleets.push(fleet);
  }

  // Sort movable fleets heaviest first for greedy balanced placement
  movableFleets.sort((a, b) => b.pesoTotalKg - a.pesoTotalKg);

  const desiredCgX = targetCgX(specs);

  let currentTotalWeight = 0;
  let currentMomentX = 0;
  let currentMomentY = 0;

  for (const fixed of fixedFleets) {
    const w = Math.max(1, fixed.pesoTotalKg);
    currentTotalWeight += w;
    currentMomentX += w * slotCoordX(fixed.mapPosition!.col, specs.cols);
    currentMomentY += w * slotCoordY(fixed.mapPosition!.row, specs.rows);
  }

  const allSlots: GridPosition[] = [];
  for (let row = 0; row < specs.rows; row++) {
    for (let col = 0; col < specs.cols; col++) {
      allSlots.push({ row, col });
    }
  }

  for (const fleet of movableFleets) {
    const w = Math.max(1, fleet.pesoTotalKg);
    let bestSlot: GridPosition | null = null;
    let bestCost = Number.POSITIVE_INFINITY;

    for (const slot of allSlots) {
      const key = `${slot.row}:${slot.col}`;
      if (occupied.has(key)) continue;

      const nx = slotCoordX(slot.col, specs.cols);
      const ny = slotCoordY(slot.row, specs.rows);
      const nextWeight = currentTotalWeight + w;
      const nextCgX = (currentMomentX + w * nx) / nextWeight;
      const nextCgY = (currentMomentY + w * ny) / nextWeight;

      const trimErr = nextCgX - desiredCgX;
      const listErr = nextCgY;
      // Encourage heavier cargo closer to center to reduce structural hogging/sagging
      const structuralCost =
        (w / 35000) * (nx * nx * 0.015 + ny * ny * 0.02);
      const zoneCost = tierPenalty(w, indicativeLookup.get(key));

      const cost =
        trimErr * trimErr * 3.0 +
        listErr * listErr * 4.5 +
        structuralCost +
        zoneCost;

      if (cost < bestCost) {
        bestCost = cost;
        bestSlot = slot;
      }
    }

    if (bestSlot) {
      fleet.mapPosition = bestSlot;
      occupied.add(`${bestSlot.row}:${bestSlot.col}`);
      currentTotalWeight += w;
      currentMomentX += w * slotCoordX(bestSlot.col, specs.cols);
      currentMomentY += w * slotCoordY(bestSlot.row, specs.rows);
    }
  }

  // Local search refinement: try swapping positions among movable fleets to lower total CG error
  const evaluateGlobalCost = (): number => {
    let tw = 0;
    let mx = 0;
    let my = 0;
    let extra = 0;
    for (const f of [...fixedFleets, ...movableFleets]) {
      if (!f.mapPosition) continue;
      const w = Math.max(1, f.pesoTotalKg);
      const nx = slotCoordX(f.mapPosition.col, specs.cols);
      const ny = slotCoordY(f.mapPosition.row, specs.rows);
      tw += w;
      mx += w * nx;
      my += w * ny;
      extra +=
        (w / 35000) * (nx * nx * 0.008 + ny * ny * 0.012) +
        tierPenalty(w, indicativeLookup.get(`${f.mapPosition.row}:${f.mapPosition.col}`));
    }
    if (tw === 0) return 0;
    const dx = mx / tw - desiredCgX;
    const dy = my / tw;
    return dx * dx * 8.0 + dy * dy * 10.0 + extra * 0.1;
  };

  let bestGlobal = evaluateGlobalCost();
  const placedMovable = movableFleets.filter((f) => f.mapPosition != null);

  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let i = 0; i < placedMovable.length; i++) {
      for (let j = i + 1; j < placedMovable.length; j++) {
        const tmp = placedMovable[i].mapPosition;
        placedMovable[i].mapPosition = placedMovable[j].mapPosition;
        placedMovable[j].mapPosition = tmp;
        const candidate = evaluateGlobalCost();
        if (candidate + 1e-6 < bestGlobal) {
          bestGlobal = candidate;
          improved = true;
        } else {
          placedMovable[j].mapPosition = placedMovable[i].mapPosition;
          placedMovable[i].mapPosition = tmp;
        }
      }
    }
    if (!improved) break;
  }

  return cloned;
}
