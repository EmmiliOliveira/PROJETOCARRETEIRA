import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBalance,
  findFleetByCode,
  normalizeIdentifier,
  optimizeStowageMap,
  parseBrazilianWeightKg,
} from './balanceEngine';
import type { BargeSpecs, FleetRecord } from '../types/operation';

const sampleSpecs: BargeSpecs = {
  name: 'Balsa BLS-129',
  blsCode: '129',
  emCode: '72',
  route: 'Belém → Manaus (NAV MAO 48)',
  rows: 5,
  cols: 7,
  maxCapacityTons: 950,
  riverCondition: 'Navegação regular',
  trimPreference: 'neutro',
  specialNotes: '',
};

function makeFleet(overrides: Partial<FleetRecord>): FleetRecord {
  return {
    id: overrides.id ?? 'f-1',
    unidadeDestino: 'NAV MAO (48)',
    veiculo: overrides.veiculo ?? '',
    chassiIdentificador: overrides.chassiIdentificador ?? 'QEC0740',
    descricaoCarga: 'CARGA TESTE',
    pesoCargaKg: 15000,
    pesoTotalKg: overrides.pesoTotalKg ?? 25000,
    bls: '129',
    em: '72',
    status: overrides.status ?? 'aguardando',
    waveNumber: 1,
    registeredAt: '2026-11-24T08:00:00.000Z',
    mapPosition: overrides.mapPosition ?? null,
    isPinned: overrides.isPinned ?? false,
  };
}

test('normalizeIdentifier and findFleetByCode match chassis plates and vehicle codes', () => {
  assert.equal(normalizeIdentifier(' qec-0740 '), 'QEC0740');
  const fleets = [
    makeFleet({ id: '1', veiculo: '8477', chassiIdentificador: 'RBY3B65' }),
    makeFleet({ id: '2', veiculo: '130P', chassiIdentificador: 'NGW6101' }),
  ];

  assert.equal(findFleetByCode(fleets, 'rby-3b65')?.id, '1');
  assert.equal(findFleetByCode(fleets, '8477')?.id, '1');
  assert.equal(findFleetByCode(fleets, '130p')?.id, '2');
  assert.equal(findFleetByCode(fleets, 'XYZ9999'), undefined);
});

test('parseBrazilianWeightKg handles Brazilian thousands and decimal formatting', () => {
  assert.equal(parseBrazilianWeightKg('25.785,576'), 25785.576);
  assert.equal(parseBrazilianWeightKg('7.154,828'), 7154.828);
  assert.equal(parseBrazilianWeightKg('19300'), 19300);
  assert.equal(parseBrazilianWeightKg(15814.828), 15814.828);
});

test('calculateBalance detects critical imbalance and flags critical fleets', () => {
  const unbalanced: FleetRecord[] = [
    makeFleet({
      id: 'heavy-bow-port',
      chassiIdentificador: 'QEC0740',
      pesoTotalKg: 34000,
      status: 'embarcada',
      mapPosition: { row: 0, col: 0 },
    }),
    makeFleet({
      id: 'heavy-bow-port-2',
      chassiIdentificador: 'DBC1891',
      pesoTotalKg: 32000,
      status: 'embarcada',
      mapPosition: { row: 0, col: 1 },
    }),
  ];

  const analysis = calculateBalance(unbalanced, sampleSpecs);
  assert.equal(analysis.status, 'critico');
  assert.ok(analysis.longitudinalImbalancePct >= 15);
  assert.ok(analysis.transversalImbalancePct >= 15);
  assert.ok(analysis.criticalFleetIds.includes('heavy-bow-port'));
});

test('optimizeStowageMap preserves boarded and pinned fleets while balancing movable fleets', () => {
  const fleets: FleetRecord[] = [
    makeFleet({
      id: 'boarded-locked',
      chassiIdentificador: 'QEC0740',
      pesoTotalKg: 30000,
      status: 'embarcada',
      mapPosition: { row: 0, col: 0 },
    }),
    makeFleet({
      id: 'pinned-locked',
      chassiIdentificador: 'RBY3B65',
      pesoTotalKg: 20000,
      status: 'aguardando',
      isPinned: true,
      mapPosition: { row: 1, col: 2 },
    }),
    makeFleet({
      id: 'movable-1',
      chassiIdentificador: 'DBC1891',
      pesoTotalKg: 31000,
      status: 'aguardando',
    }),
    makeFleet({
      id: 'movable-2',
      chassiIdentificador: 'FRU4821',
      pesoTotalKg: 22000,
      status: 'aguardando',
    }),
    makeFleet({
      id: 'movable-3',
      chassiIdentificador: 'EQQ5249',
      pesoTotalKg: 18500,
      status: 'aguardando',
    }),
  ];

  const before = calculateBalance(fleets, sampleSpecs);
  const optimized = optimizeStowageMap(fleets, sampleSpecs);
  const after = calculateBalance(optimized, sampleSpecs);

  const boardedAfter = optimized.find((f) => f.id === 'boarded-locked')!;
  const pinnedAfter = optimized.find((f) => f.id === 'pinned-locked')!;

  assert.deepEqual(boardedAfter.mapPosition, { row: 0, col: 0 });
  assert.deepEqual(pinnedAfter.mapPosition, { row: 1, col: 2 });
  assert.equal(after.placedCount, 5);
  assert.ok(
    after.longitudinalImbalancePct < before.longitudinalImbalancePct,
    `Expected longitudinal imbalance (${after.longitudinalImbalancePct}) to improve over ${before.longitudinalImbalancePct}`,
  );
  assert.ok(
    after.transversalImbalancePct < before.transversalImbalancePct,
    `Expected transversal imbalance (${after.transversalImbalancePct}) to improve over ${before.transversalImbalancePct}`,
  );
});
