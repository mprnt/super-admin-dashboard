/**
 * The four commercial models a partner can be on. Mirrors
 * mprnt-backend/src/types/businessModels.ts. The ids are stored in
 * organizations.business_model, so they must match exactly.
 */

export const BUSINESS_MODEL_IDS = [
  'integration',
  'revenue-share',
  'own-station',
  'full-purchase',
] as const;

export type BusinessModelId = (typeof BUSINESS_MODEL_IDS)[number];

export interface BusinessModel {
  id: BusinessModelId;
  /** As the website labels it, e.g. "Model 2 · Option A". */
  label: string;
  /** Short chip text, e.g. "Model 2A". */
  short: string;
  name: string;
  family: 'Printer Integration' | 'MPRNT Station';
  /** What the partner supplies and what MPrnt supplies, in one line. */
  summary: string;
}

export const BUSINESS_MODELS: readonly BusinessModel[] = [
  {
    id: 'integration',
    label: 'Model 1',
    short: 'Model 1',
    name: 'Printer Integration',
    family: 'Printer Integration',
    summary: 'The partner connects a printer it already owns. MPrnt supplies the software.',
  },
  {
    id: 'revenue-share',
    label: 'Model 2 · Option A',
    short: 'Model 2A',
    name: 'Station · Revenue Share',
    family: 'MPRNT Station',
    summary: 'An MPrnt station is placed with the partner, and revenue is shared.',
  },
  {
    id: 'own-station',
    label: 'Model 2 · Option B',
    short: 'Model 2B',
    name: 'Station · Purchase + Monthly Software',
    family: 'MPRNT Station',
    summary: 'The partner buys the station and pays a monthly software fee.',
  },
  {
    id: 'full-purchase',
    label: 'Model 3',
    short: 'Model 3',
    name: 'Station · Full Purchase & Support',
    family: 'MPRNT Station',
    summary: 'The partner buys the station outright and MPrnt provides support.',
  },
];

export function isBusinessModelId(value: unknown): value is BusinessModelId {
  return typeof value === 'string' && (BUSINESS_MODEL_IDS as readonly string[]).includes(value);
}

export function modelById(id: string | null | undefined): BusinessModel | null {
  if (!id) return null;
  return BUSINESS_MODELS.find((m) => m.id === id) ?? null;
}
