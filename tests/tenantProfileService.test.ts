import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const tenants: any[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    tenant: {
      findUnique: vi.fn(async ({ where }: any) => tenants.find((t) => t.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const tenant = tenants.find((t) => t.id === where.id);
        Object.assign(tenant, data);
        return { ...tenant };
      }),
    },
  },
}));

const { recordActivityMock } = vi.hoisted(() => ({ recordActivityMock: vi.fn() }));
vi.mock('../src/modules/activity/activityLogService.js', () => ({
  recordActivity: recordActivityMock,
}));

import prisma from '../src/lib/prisma.js';
import {
  buildTenantLogoUrl,
  decodeLogoPayload,
  getTenantLogo,
  MAX_LOGO_BYTES,
  removeTenantLogo,
  setTenantLogo,
  toTenantBranding,
  updateTenantProfile,
} from '../src/modules/tenant/tenantProfileService.js';
import { drawCompanyHeader } from '../src/lib/pdfCompanyHeader.js';

const TENANT_ID = '11111111-2222-4333-8444-555555555555';
// 1×1 transparent PNG.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

beforeEach(() => {
  vi.clearAllMocks();
  tenants.length = 0;
  tenants.push({
    id: TENANT_ID,
    name: 'Acme',
    currency: 'USD',
    legalName: null,
    address: null,
    phone: null,
    website: null,
    companySize: '1-10',
    industry: 'Software',
    country: 'Argentina',
    logoData: null,
    logoMimeType: null,
    logoUpdatedAt: null,
  });
});

describe('updateTenantProfile', () => {
  it('updates the given fields, trims them and records activity', async () => {
    const result = await updateTenantProfile(TENANT_ID, { name: '  Acme SRL ', legalName: 'Acme S.R.L.', address: 'Av. Siempre Viva 742' }, 'user-1');

    expect(result.success).toBe(true);
    expect(tenants[0].name).toBe('Acme SRL');
    expect(tenants[0].legalName).toBe('Acme S.R.L.');
    expect(recordActivityMock).toHaveBeenCalledOnce();
  });

  it('only writes the fields that were sent', async () => {
    await updateTenantProfile(TENANT_ID, { phone: '+54 11 5555-1234' }, 'user-1');

    const data = vi.mocked(prisma.tenant.update).mock.calls[0][0].data;
    expect(data).toEqual({ phone: '+54 11 5555-1234' });
  });

  it('clears optional fields sent as empty strings', async () => {
    tenants[0].legalName = 'Old legal name';
    await updateTenantProfile(TENANT_ID, { legalName: '' }, 'user-1');
    expect(tenants[0].legalName).toBeNull();
  });

  it('rejects an empty company name', async () => {
    const result = await updateTenantProfile(TENANT_ID, { name: '   ' }, 'user-1');
    expect(result).toMatchObject({ success: false, field: 'name' });
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid phone, company size or currency', async () => {
    expect(await updateTenantProfile(TENANT_ID, { phone: 'call me' }, 'u')).toMatchObject({ success: false, field: 'phone' });
    expect(await updateTenantProfile(TENANT_ID, { companySize: '3-7' }, 'u')).toMatchObject({ success: false, field: 'companySize' });
    expect(await updateTenantProfile(TENANT_ID, { currency: 'XXXX' }, 'u')).toMatchObject({ success: false, field: 'currency' });
  });

  it('rejects over-long values and non-string types', async () => {
    expect(await updateTenantProfile(TENANT_ID, { address: 'x'.repeat(301) }, 'u')).toMatchObject({ success: false, field: 'address' });
    expect(await updateTenantProfile(TENANT_ID, { name: 42 }, 'u')).toMatchObject({ success: false, field: 'name' });
  });

  it('adds https:// to a bare website and rejects non-http(s) URLs', async () => {
    await updateTenantProfile(TENANT_ID, { website: 'acme.com' }, 'u');
    expect(tenants[0].website).toBe('https://acme.com');

    expect(await updateTenantProfile(TENANT_ID, { website: 'javascript:alert(1)' }, 'u')).toMatchObject({ success: false, field: 'website' });
    expect(await updateTenantProfile(TENANT_ID, { website: 'not a url' }, 'u')).toMatchObject({ success: false, field: 'website' });
  });

  it('still accepts a currency-only update (the endpoint\'s original contract)', async () => {
    const result = await updateTenantProfile(TENANT_ID, { currency: 'ARS' }, 'u');
    expect(result.success).toBe(true);
    expect(tenants[0].currency).toBe('ARS');
  });

  it('rejects an empty body', async () => {
    expect(await updateTenantProfile(TENANT_ID, {}, 'u')).toMatchObject({ success: false });
  });
});

describe('logo', () => {
  it('decodes a PNG data URL and detects the type from its bytes', () => {
    const decoded = decodeLogoPayload(`data:image/png;base64,${PNG_BASE64}`);
    expect(decoded).toMatchObject({ mimeType: 'image/png' });
  });

  it('detects a JPEG by its magic bytes regardless of the data URL prefix', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString('base64');
    expect(decodeLogoPayload(`data:image/png;base64,${jpeg}`)).toMatchObject({ mimeType: 'image/jpeg' });
  });

  it('rejects non-images (e.g. an SVG or a script) and oversized payloads', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    expect(decodeLogoPayload(`data:image/svg+xml;base64,${svg}`)).toHaveProperty('error');
    expect(decodeLogoPayload('not base64 !!')).toHaveProperty('error');
    expect(decodeLogoPayload(undefined)).toHaveProperty('error');

    const huge = Buffer.alloc(MAX_LOGO_BYTES + 1);
    huge.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(decodeLogoPayload(huge.toString('base64'))).toHaveProperty('error');
  });

  it('stores and removes the logo, bumping logoUpdatedAt', async () => {
    const uploaded = await setTenantLogo(TENANT_ID, PNG_BASE64, 'u');
    expect(uploaded.success).toBe(true);
    expect(tenants[0].logoMimeType).toBe('image/png');
    expect(tenants[0].logoUpdatedAt).toBeInstanceOf(Date);
    expect(await getTenantLogo(TENANT_ID)).toMatchObject({ mimeType: 'image/png' });

    await removeTenantLogo(TENANT_ID, 'u');
    expect(tenants[0].logoData).toBeNull();
    expect(tenants[0].logoUpdatedAt).toBeNull();
    expect(await getTenantLogo(TENANT_ID)).toBeNull();
  });

  it('never queries for a non-UUID tenant id on the public route', async () => {
    expect(await getTenantLogo('../../etc')).toBeNull();
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('builds a cache-busted absolute logo URL, or null when there is none', () => {
    const when = new Date('2026-09-25T12:00:00Z');
    expect(buildTenantLogoUrl(TENANT_ID, when)).toMatch(new RegExp(`/api/public/tenant-logo/${TENANT_ID}\\?v=${when.getTime()}$`));
    expect(buildTenantLogoUrl(TENANT_ID, null)).toBeNull();
  });
});

describe('drawCompanyHeader', () => {
  async function render(branding: ReturnType<typeof toTenantBranding>) {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const y = await drawCompanyHeader({ doc, page, font, boldFont, branding, y: 700 });
    await doc.save();
    return y;
  }

  it('renders logo + details and moves y down past each detail line', async () => {
    const withDetails = await render(
      toTenantBranding({
        name: 'Acme',
        legalName: 'Acme S.R.L.',
        address: 'Av. Corrientes 1234, CABA',
        phone: '+54 11 5555-1234',
        website: 'https://acme.com',
        logoData: Buffer.from(PNG_BASE64, 'base64'),
        logoMimeType: 'image/png',
      }),
    );
    const nameOnly = await render(
      toTenantBranding({ name: 'Acme', legalName: null, address: null, phone: null, website: null, logoData: null, logoMimeType: null }),
    );
    expect(withDetails).toBeLessThan(nameOnly);
  });

  it('does not throw on characters Helvetica cannot encode or on a corrupt logo', async () => {
    await expect(
      render(
        toTenantBranding({
          name: 'Acme 🚀 株式会社',
          legalName: null,
          address: 'Calle → 123',
          phone: null,
          website: null,
          logoData: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
          logoMimeType: 'image/png',
        }),
      ),
    ).resolves.toBeTypeOf('number');
  });
});
