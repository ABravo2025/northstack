import prisma from '../../lib/prisma.js';
import { decryptExpenseData, encryptExpenseData } from '../../lib/expenseEncryption.js';
import { ExpenseError } from './expenseService.js';

// Cruces D4 (spec-clientes-gastos-formularios.md): the receipt of an expense — a photo or a PDF —
// encrypted with the module's key, file name included. One per movement; replacing it overwrites.

export const MAX_RECEIPT_BYTES = 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// What the bytes say they are, whatever the browser claimed.
export function sniffMime(bytes: Buffer): string | null {
  if (bytes.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

async function ownedMovement(tenantId: string, movementId: string) {
  const m = await prisma.expenseMovement.findFirst({ where: { id: movementId, tenantId }, select: { id: true } });
  if (!m) throw new ExpenseError('Movement not found', 404);
}

export async function saveReceipt(tenantId: string, movementId: string, input: { fileName: string; mimeType: string; dataBase64: string }) {
  await ownedMovement(tenantId, movementId);
  const bytes = Buffer.from(input.dataBase64, 'base64');
  if (!bytes.length) throw new ExpenseError('Choose a file', 400, 'no_file');
  if (bytes.length > MAX_RECEIPT_BYTES) throw new ExpenseError('The file is larger than 1 MB', 400, 'too_large');
  const mimeType = sniffMime(bytes);
  if (!mimeType || !ALLOWED.includes(mimeType)) throw new ExpenseError('Only PDF, JPG, PNG or WEBP', 400, 'bad_type');
  const data = {
    nameEnc: encryptExpenseData(input.fileName.trim() || 'receipt'),
    mimeType,
    sizeBytes: bytes.length,
    dataEnc: encryptExpenseData(bytes.toString('base64')),
  };
  const receipt = await prisma.expenseReceipt.upsert({
    where: { movementId },
    create: { tenantId, movementId, ...data },
    update: data,
    select: { id: true, mimeType: true, sizeBytes: true },
  });
  return receipt;
}

export async function getReceipt(tenantId: string, movementId: string) {
  const r = await prisma.expenseReceipt.findFirst({ where: { movementId, tenantId } });
  if (!r) throw new ExpenseError('No receipt', 404);
  return { fileName: decryptExpenseData(r.nameEnc), mimeType: r.mimeType, bytes: Buffer.from(decryptExpenseData(r.dataEnc), 'base64') };
}

export async function deleteReceipt(tenantId: string, movementId: string) {
  const r = await prisma.expenseReceipt.findFirst({ where: { movementId, tenantId }, select: { id: true } });
  if (!r) throw new ExpenseError('No receipt', 404);
  await prisma.expenseReceipt.delete({ where: { id: r.id } });
}
