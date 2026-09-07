import { describe, expect, it } from 'vitest';
import { InvalidCursorError, paginate } from '../src/routes/externalApi.js';

function fakeReq(query: Record<string, string> = {}): any {
  return { query };
}

interface Row {
  id: string;
}

function rows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: `id_${i}` }));
}

describe('paginate', () => {
  it('returns the default page size and a nextCursor when more rows remain', () => {
    const result = paginate(rows(75), fakeReq());
    expect(result.data).toHaveLength(50);
    expect(result.data[0].id).toBe('id_0');
    expect(result.nextCursor).toBe('id_49');
  });

  it('returns null nextCursor once every row has been returned', () => {
    const result = paginate(rows(30), fakeReq());
    expect(result.data).toHaveLength(30);
    expect(result.nextCursor).toBeNull();
  });

  it('resumes after the given cursor', () => {
    const first = paginate(rows(75), fakeReq({ limit: '50' }));
    const second = paginate(rows(75), fakeReq({ cursor: first.nextCursor!, limit: '50' }));
    expect(second.data).toHaveLength(25);
    expect(second.data[0].id).toBe('id_50');
    expect(second.nextCursor).toBeNull();
  });

  it('respects a custom limit within the max page size', () => {
    const result = paginate(rows(10), fakeReq({ limit: '3' }));
    expect(result.data).toHaveLength(3);
    expect(result.nextCursor).toBe('id_2');
  });

  it('clamps a limit above the max page size (200)', () => {
    const result = paginate(rows(250), fakeReq({ limit: '9999' }));
    expect(result.data).toHaveLength(200);
  });

  it('ignores a nonsensical limit (zero, negative, non-numeric) and falls back to the default', () => {
    expect(paginate(rows(60), fakeReq({ limit: '0' })).data).toHaveLength(50);
    expect(paginate(rows(60), fakeReq({ limit: '-5' })).data).toHaveLength(50);
    expect(paginate(rows(60), fakeReq({ limit: 'abc' })).data).toHaveLength(50);
  });

  it('throws InvalidCursorError for a cursor that matches no row, instead of silently restarting at page 1', () => {
    expect(() => paginate(rows(10), fakeReq({ cursor: 'does_not_exist' }))).toThrow(InvalidCursorError);
  });
});
