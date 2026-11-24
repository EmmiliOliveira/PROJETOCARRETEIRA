import type {
  BargeSpecs,
  FleetRecord,
  OccurrenceRecord,
  ScanLogEntry,
} from '../types/operation';

export const DEFAULT_BARGE_SPECS: BargeSpecs = {
  name: '',
  blsCode: '',
  emCode: '',
  route: '',
  rows: 5,
  cols: 7,
  maxCapacityTons: 950,
  riverCondition: '',
  trimPreference: 'neutro',
  specialNotes: '',
};

export const INITIAL_FLEETS: FleetRecord[] = [];

export const INITIAL_SCAN_LOGS: ScanLogEntry[] = [];

export const INITIAL_OCCURRENCES: OccurrenceRecord[] = [];
