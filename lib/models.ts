/**
 * The commercial model this console manages: Model 1, printer integration. The partner
 * connects a printer it already owns, and MPRNT supplies the software. Models 2 and 3
 * (MPRNT stations) are run from their own dashboard, so they are not listed here.
 *
 * The id is stored in organizations.business_model and must match the backend, which
 * still accepts the other ids for partners onboarded under them.
 */

export const BUSINESS_MODEL_IDS = ['integration'] as const;

export type BusinessModelId = (typeof BUSINESS_MODEL_IDS)[number];

export interface BusinessModel {
  id: BusinessModelId;
  /** As the website labels it. */
  label: string;
  /** Short chip text. */
  short: string;
  name: string;
  family: 'Printer Integration';
  /** What the partner supplies and what MPRNT supplies, in one line. */
  summary: string;
}

export const PRINTER_INTEGRATION: BusinessModel = {
  id: 'integration',
  label: 'Model 1',
  short: 'Model 1',
  name: 'Printer Integration',
  family: 'Printer Integration',
  summary: 'The partner connects a printer it already owns. MPRNT supplies the software.',
};

export const BUSINESS_MODELS: readonly BusinessModel[] = [PRINTER_INTEGRATION];

export function isBusinessModelId(value: unknown): value is BusinessModelId {
  return typeof value === 'string' && (BUSINESS_MODEL_IDS as readonly string[]).includes(value);
}

/** True for a partner on Model 1. Only these partners are shown in this console. */
export function isModelOne(org: { businessModel: string | null }): boolean {
  return org.businessModel === PRINTER_INTEGRATION.id;
}

export function modelById(id: string | null | undefined): BusinessModel | null {
  if (!id) return null;
  return BUSINESS_MODELS.find((m) => m.id === id) ?? null;
}
