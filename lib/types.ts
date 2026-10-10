/**
 * Response shapes from mprnt-backend's /admin routes. Field names match the
 * backend exactly; a field the backend does not return is not invented here.
 */

import type { BusinessModelId } from './models';

export type OrgStatus = 'active' | 'suspended';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  /** The partnership model in force now. null = never recorded. */
  businessModel: BusinessModelId | null;
  timezone: string;
  contactEmail: string | null;
  contactPhone: string | null;
  kioskCount?: number;
  adminCount?: number;
  createdAt: string;
}

export type KioskStatus = 'active' | 'inactive' | 'maintenance';

export interface Kiosk {
  id: string;
  kioskId: string;
  name: string;
  location: string;
  status: KioskStatus | string;
  organizationId: string | null;
  organizationName: string | null;
  printersOnline: number;
  printersTotal: number;
}

export type PrinterStatus = 'online' | 'busy' | 'offline' | 'revoked' | string;

export interface Printer {
  printerId: string;
  name: string;
  status: PrinterStatus;
  kiosk: { id: string; code: string; name: string | null };
  organization: { id: string; name: string | null } | null;
  enrollment: {
    keyPrefix: string | null;
    keyIssuedAt: string | null;
    enrolled: boolean;
    revokedAt: string | null;
    lastSeenIp: string | null;
  };
  station: { isStation: boolean; name: string | null; label: string };
  lastHeartbeat: string | null;
  secondsSinceHeartbeat: number | null;
  silent: boolean;
  activeJobs: number;
  paperLevel: number | null;
  inkLevelBlack: number | null;
  capabilities: { color: boolean; doubleSided: boolean };
}

export type AdminRole = 'super_admin' | 'owner' | 'manager' | 'viewer';

export interface StaffUser {
  id: string;
  email: string;
  fullName: string | null;
  role: AdminRole;
  organizationId: string | null;
  organizationName: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export type PermissionEffect = 'grant' | 'deny';

export interface PermissionOverride {
  permission: string;
  effect: PermissionEffect;
  created_at: string;
}

export interface StaffPermissions {
  role: AdminRole;
  effective: string[];
  overrides: PermissionOverride[];
}

export interface PermissionCatalogue {
  permissions: string[];
  roles: { role: AdminRole; permissions: string[] }[];
}

export type JobStatus = 'pending' | 'queued' | 'printing' | 'completed' | 'failed' | 'cancelled' | string;

export interface SessionRow {
  jobId: string;
  sessionCode: string | null;
  kiosk: { code: string; name: string | null };
  printer: { id: string; name: string | null } | null;
  createdAt: string;
  completedAt: string | null;
  status: JobStatus;
  paymentStatus: string;
  settings: { colorMode: string; printSides: string; copies: number };
  pages: { charged: number; printed: number; sheets: number };
  amount: number;
  pricePerPage: number;
  durationSeconds: number | null;
  errorMessage: string | null;
}

export interface Range {
  from: string;
  to: string;
  period: string;
}

export interface Totals {
  revenue: number;
  paidJobs: number;
  completedJobs: number;
  failedJobs: number;
  pages: number;
}

export interface Comparison {
  current: Totals;
  previous: Totals;
  change: { revenuePct: number | null; paidJobsPct: number | null; pagesPct: number | null };
}

export interface Summary {
  totalJobs: number;
  paidJobs: number;
  completedJobs: number;
  failedJobs: number;
  inProgressJobs: number;
  sessions: number;
  revenue: number;
  pagesCharged: number;
  pagesPrinted: number;
  colorPages: number;
  bwPages: number;
  avgPrintSeconds: number;
  fulfilmentRate: number | null;
  averageOrderValue: number;
}

export interface SeriesPoint {
  date: string;
  jobs: number;
  completed: number;
  failed: number;
  revenue: number;
  pages: number;
}

export interface KioskBreakdownRow {
  kioskId: string;
  code: string;
  name: string | null;
  location: string | null;
  jobs: number;
  completed: number;
  revenue: number;
  pages: number;
}

export interface PriceRate {
  pricePerPage: number;
  currency: string;
  description: string;
}

export interface PricingInfo {
  blackAndWhite: PriceRate;
  color: PriceRate;
  minCharge: number;
  source: string;
  notes: string[];
}

export interface PriceList {
  id: string;
  scope: 'platform' | 'organization' | 'kiosk';
  organizationId: string | null;
  organizationName: string | null;
  kioskId: string | null;
  kioskCode: string | null;
  bwPerPage: number;
  colorPerPage: number;
  minCharge: number;
  effectiveFrom: string;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  actorScope: 'platform' | 'shop';
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  organization: { id: string; name: string | null } | null;
  actor: { email: string; name: string | null; role: string } | null;
}

export interface AttentionJob {
  jobId: string;
  status: string;
  queueStatus: string | null;
  amount: number;
  kiosk: { code: string; name: string | null };
  createdAt: string;
  ageSeconds: number;
  retryCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  refundCandidate: boolean;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  message: string;
  source: string;
  createdAt: string;
}

export type Activity = 'active' | 'inactive' | 'new' | 'suspended';

export interface OrgComparisonRow {
  organization: {
    id: string;
    name: string;
    slug: string;
    status: OrgStatus;
    businessModel: BusinessModelId | null;
    timezone: string;
  };
  current: Totals;
  previous: Totals;
  change: Comparison['change'];
  fulfilmentRate: number | null;
  kiosks: number;
  printersOnline: number;
  printersTotal: number;
  lastPaidAt: string | null;
  daysSinceLastPaid: number | null;
  activity: Activity;
}

export interface OrgComparison {
  period: string;
  inactiveAfterDays: number;
  organizations: OrgComparisonRow[];
  totals: Comparison;
}

export interface QueueStatus {
  queue: { queued: number; assigned: number; printing: number; completed: number; failed: number };
  timestamp: string;
}

/** A printer enrollment or key rotation: the key is shown once and never stored. */
export interface IssuedKey {
  printerId: string;
  apiKey: string;
  keyPrefix: string;
  issuedAt: string;
}

export interface CreatedStaff {
  user: StaffUser;
  temporaryPassword: string;
}

export interface SessionUser {
  id: string;
  email: string;
  role: AdminRole;
  mustChangePassword: boolean;
}
