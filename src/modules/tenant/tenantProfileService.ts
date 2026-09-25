import type { Tenant } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { isPhoneValid, PHONE_POLICY_MESSAGE } from '../auth/authService.js';
import { recordActivity } from '../activity/activityLogService.js';
import { tenantActivityFieldConfig } from '../activity/fieldConfigs/tenantFieldConfig.js';
import { TENANT_SUMMARY_SELECT, type TenantSummary } from './tenantSummary.js';

// Settings → Company (2026-09-25). Company profile fields + logo, edited by anyone with
// manage_tenant_settings. Deliberately no tax ID field — collecting one is ruled out by the
// privacy policy. The data is only surfaced on payslips, employee contracts, invitation emails
// and the app sidebar (see getTenantBranding below).

// Mirrors frontend/src/lib/companySize.ts — the signup survey never validated this server-side,
// but an edit form is a second writer, so the bands are enforced here now.
export const COMPANY_SIZE_OPTIONS = ['1-10', '11-50', '51-200', '201-500', '500+'];

// The browser resizes to ≤512px before uploading (CompanyPage.tsx), which lands around
// 50–150 KB; this cap only stops a hand-crafted request from parking megabytes in a DB row.
export const MAX_LOGO_BYTES = 512 * 1024;

const TEXT_LIMITS = {
  name: 120,
  legalName: 200,
  address: 300,
  phone: 40,
  website: 200,
  industry: 100,
  country: 100,
} as const;

export interface TenantProfileInput {
  name?: unknown;
  legalName?: unknown;
  address?: unknown;
  phone?: unknown;
  website?: unknown;
  companySize?: unknown;
  industry?: unknown;
  country?: unknown;
  currency?: unknown;
}

export interface TenantProfileResult {
  success: boolean;
  tenant?: TenantSummary;
  error?: string;
  field?: string;
}

type ProfileData = {
  name?: string;
  legalName?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  companySize?: string | null;
  industry?: string | null;
  country?: string | null;
  currency?: string;
};

// Accepts "acme.com" as well as "https://acme.com" — people rarely type the scheme — but only
// ever stores http(s) URLs, since the value is rendered as a link/text on documents.
function normalizeWebsite(raw: string): string | null {
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return candidate;
  } catch {
    return null;
  }
}

function validateProfileInput(input: TenantProfileInput): { data: ProfileData } | { error: string; field: string } {
  const data: ProfileData = {};

  for (const key of Object.keys(TEXT_LIMITS) as (keyof typeof TEXT_LIMITS)[]) {
    const raw = input[key];
    if (raw === undefined) continue;
    if (raw !== null && typeof raw !== 'string') {
      return { error: `${key} must be a string`, field: key };
    }
    const value = (raw ?? '').trim();
    if (value.length > TEXT_LIMITS[key]) {
      return { error: `${key} must be at most ${TEXT_LIMITS[key]} characters`, field: key };
    }
    if (key === 'name') {
      if (!value) return { error: 'Company name is required', field: 'name' };
      data.name = value;
      continue;
    }
    data[key] = value || null;
  }

  if (data.phone && !isPhoneValid(data.phone)) {
    return { error: PHONE_POLICY_MESSAGE, field: 'phone' };
  }
  if (data.website) {
    const website = normalizeWebsite(data.website);
    if (!website) return { error: 'Please enter a valid website URL', field: 'website' };
    data.website = website;
  }

  if (input.companySize !== undefined) {
    if (input.companySize === null || input.companySize === '') {
      data.companySize = null;
    } else if (typeof input.companySize !== 'string' || !COMPANY_SIZE_OPTIONS.includes(input.companySize)) {
      return { error: 'Invalid company size', field: 'companySize' };
    } else {
      data.companySize = input.companySize;
    }
  }

  if (input.currency !== undefined) {
    if (typeof input.currency !== 'string' || !Intl.supportedValuesOf('currency').includes(input.currency)) {
      return { error: 'Invalid currency code', field: 'currency' };
    }
    data.currency = input.currency;
  }

  return { data };
}

export async function updateTenantProfile(
  tenantId: string,
  input: TenantProfileInput,
  changedByUserId: string,
): Promise<TenantProfileResult> {
  const validated = validateProfileInput(input);
  if ('error' in validated) {
    return { success: false, error: validated.error, field: validated.field };
  }
  if (Object.keys(validated.data).length === 0) {
    return { success: false, error: 'Nothing to update' };
  }

  const existing = await prisma.tenant.findUnique({ where: { id: tenantId }, select: TENANT_SUMMARY_SELECT });
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: validated.data,
    select: TENANT_SUMMARY_SELECT,
  });

  await recordActivity({
    tenantId,
    entityType: 'tenant',
    entityId: tenantId,
    entityLabel: tenant.name,
    action: 'update',
    changedByUserId,
    before: existing,
    after: tenant,
    fieldConfig: tenantActivityFieldConfig,
  });

  return { success: true, tenant };
}

// The MIME type is decided from the file's own magic bytes, never from what the client claims —
// the public logo route serves these bytes back with this Content-Type.
function detectImageMimeType(bytes: Buffer): 'image/png' | 'image/jpeg' | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  return null;
}

// Accepts either a bare base64 string or a data: URL (what canvas.toDataURL() produces).
export function decodeLogoPayload(raw: unknown): { bytes: Buffer; mimeType: 'image/png' | 'image/jpeg' } | { error: string } {
  if (typeof raw !== 'string' || !raw) {
    return { error: 'Logo image is required' };
  }
  const base64 = raw.replace(/^data:[^;,]*;base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    return { error: 'Logo must be base64-encoded' };
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_LOGO_BYTES) {
    return { error: 'Logo is too large (max 512 KB after resizing)' };
  }
  const mimeType = detectImageMimeType(bytes);
  if (!mimeType) {
    return { error: 'Logo must be a PNG or JPG image' };
  }
  return { bytes, mimeType };
}

async function writeLogo(
  tenantId: string,
  logo: { bytes: Buffer; mimeType: string } | null,
  changedByUserId: string,
): Promise<TenantProfileResult> {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId }, select: TENANT_SUMMARY_SELECT });
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: logo
      ? { logoData: logo.bytes, logoMimeType: logo.mimeType, logoUpdatedAt: new Date() }
      : { logoData: null, logoMimeType: null, logoUpdatedAt: null },
    select: TENANT_SUMMARY_SELECT,
  });

  await recordActivity({
    tenantId,
    entityType: 'tenant',
    entityId: tenantId,
    entityLabel: tenant.name,
    action: 'update',
    changedByUserId,
    before: existing,
    after: tenant,
    fieldConfig: tenantActivityFieldConfig,
  });

  return { success: true, tenant };
}

export async function setTenantLogo(tenantId: string, rawImage: unknown, changedByUserId: string): Promise<TenantProfileResult> {
  const decoded = decodeLogoPayload(rawImage);
  if ('error' in decoded) {
    return { success: false, error: decoded.error, field: 'logo' };
  }
  return writeLogo(tenantId, decoded, changedByUserId);
}

export async function removeTenantLogo(tenantId: string, changedByUserId: string): Promise<TenantProfileResult> {
  return writeLogo(tenantId, null, changedByUserId);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getTenantLogo(tenantId: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
  if (!UUID_REGEX.test(tenantId)) return null;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { logoData: true, logoMimeType: true },
  });
  if (!tenant?.logoData || !tenant.logoMimeType) return null;
  return { bytes: Buffer.from(tenant.logoData), mimeType: tenant.logoMimeType };
}

export interface TenantBranding {
  name: string;
  legalName: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  logo: { bytes: Uint8Array; mimeType: string } | null;
}

// Everything a generated document (payslip, contract PDF) needs for its header. Callers already
// load the full Tenant row, so this just narrows it rather than issuing another query.
export function toTenantBranding(
  tenant: Pick<Tenant, 'name' | 'legalName' | 'address' | 'phone' | 'website' | 'logoData' | 'logoMimeType'>,
): TenantBranding {
  return {
    name: tenant.name,
    legalName: tenant.legalName,
    address: tenant.address,
    phone: tenant.phone,
    website: tenant.website,
    logo: tenant.logoData && tenant.logoMimeType ? { bytes: tenant.logoData, mimeType: tenant.logoMimeType } : null,
  };
}

// Absolute, cache-busted URL for places that can't use a relative path (emails). Null when the
// tenant has no logo, so callers can skip the <img> entirely.
export function buildTenantLogoUrl(tenantId: string, logoUpdatedAt: Date | null): string | null {
  if (!logoUpdatedAt) return null;
  const base = process.env.APP_BASE_URL ?? 'http://localhost:5173';
  return `${base}/api/public/tenant-logo/${tenantId}?v=${logoUpdatedAt.getTime()}`;
}
