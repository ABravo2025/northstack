import prisma from '../../lib/prisma.js';

// Account deletion, second step (Alejandro, 2026-10-04: "se elimina en 10 días", whether the owner
// asked from the app or Northstack staff did it from the Admin). Runs daily from the
// plan-transitions cron: every tenant whose deletionScheduledAt has passed is erased — all rows
// that belong to it, found by walking the database's own foreign keys from Tenant (so no
// hand-kept table list goes stale when a model is added). Platform staff users sitting in the
// tenant are detached, never deleted. Rows of other tenants are never touched: every lookup starts
// from this tenant's own ids.

export interface ForeignKey {
  child: string;
  column: string;
  parent: string;
  deleteRule: string; // CASCADE | SET NULL | RESTRICT | NO ACTION
}

export interface PurgeStep {
  table: string;
  column: string;
  ids: string[];
}

// Which rows belong to the tenant. Pure (graph + a lookup function) so it's testable without a DB.
// A SET NULL link is left to the database (the row survives, e.g. a platform audit entry) except
// User.tenantId: the tenant's users go with it.
export async function planTenantPurge(
  tenantId: string,
  fks: ForeignKey[],
  lookup: (table: string, column: string, ids: string[]) => Promise<string[] | null>, // null = no "id" column
): Promise<{ steps: PurgeStep[]; rows: Map<string, Set<string>> }> {
  const rows = new Map<string, Set<string>>([['Tenant', new Set([tenantId])]]);
  const steps: PurgeStep[] = [];
  const queue = ['Tenant'];
  const seen = new Set<string>();
  while (queue.length) {
    const parent = queue.shift()!;
    const parentIds = [...(rows.get(parent) ?? [])];
    for (const fk of fks.filter((f) => f.parent === parent)) {
      if (fk.deleteRule === 'SET NULL' && !(fk.child === 'User' && fk.column === 'tenantId')) continue;
      const key = `${fk.child}.${fk.column}<-${parent}#${parentIds.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const found = await lookup(fk.child, fk.column, parentIds);
      if (found === null) {
        steps.push({ table: fk.child, column: fk.column, ids: parentIds });
        continue;
      }
      const set = rows.get(fk.child) ?? new Set<string>();
      const before = set.size;
      for (const id of found) set.add(id);
      rows.set(fk.child, set);
      if (set.size > before) queue.push(fk.child);
    }
  }
  return { steps, rows };
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

export async function purgeTenant(tenantId: string): Promise<{ deleted: Record<string, number>; blocked: string[] }> {
  await prisma.user.updateMany({ where: { tenantId, platformRole: { not: null } }, data: { tenantId: null } });

  const fks = await prisma.$queryRawUnsafe<ForeignKey[]>(`
    SELECT kcu.table_name AS child, kcu.column_name AS "column", ccu.table_name AS parent, rc.delete_rule AS "deleteRule"
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name AND kcu.constraint_schema = rc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.constraint_name AND ccu.constraint_schema = rc.constraint_schema
    WHERE rc.constraint_schema = 'public'`);
  const idTables = new Set(
    (await prisma.$queryRawUnsafe<{ t: string }[]>(`SELECT table_name AS t FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'id'`)).map((r) => r.t),
  );
  const { steps, rows } = await planTenantPurge(tenantId, fks, async (table, column, ids) => {
    if (!idTables.has(table)) return null;
    const found = await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM ${ident(table)} WHERE ${ident(column)} = ANY($1::text[])`, ids);
    return found.map((f) => f.id);
  });

  // Children first; a delete still blocked by a reference is retried on the next pass.
  type Op = { label: string; run: () => Promise<number> };
  let pending: Op[] = [
    ...steps.map((s) => ({ label: `${s.table}.${s.column}`, run: () => prisma.$executeRawUnsafe(`DELETE FROM ${ident(s.table)} WHERE ${ident(s.column)} = ANY($1::text[])`, s.ids) })),
    ...[...rows.entries()].reverse().map(([table, ids]) => ({ label: table, run: () => prisma.$executeRawUnsafe(`DELETE FROM ${ident(table)} WHERE "id" = ANY($1::text[])`, [...ids]) })),
  ];
  const deleted: Record<string, number> = {};
  for (let pass = 0; pass < 8 && pending.length; pass++) {
    const next: Op[] = [];
    for (const op of pending) {
      try {
        deleted[op.label] = (deleted[op.label] ?? 0) + (await op.run());
      } catch {
        next.push(op);
      }
    }
    if (next.length === pending.length) break;
    pending = next;
  }
  return { deleted, blocked: pending.map((p) => p.label) };
}

export async function purgeDueTenants(now: Date = new Date()): Promise<{ purged: string[]; failed: string[] }> {
  const due = await prisma.tenant.findMany({ where: { deletionScheduledAt: { lte: now } }, select: { id: true, name: true } });
  const purged: string[] = [];
  const failed: string[] = [];
  for (const t of due) {
    try {
      const r = await purgeTenant(t.id);
      console.log(`purgeDueTenants: ${t.name} (${t.id})`, JSON.stringify(r));
      if (r.blocked.length) failed.push(`${t.name}: ${r.blocked.join(', ')}`);
      else purged.push(t.name);
    } catch (err) {
      console.error(`purgeDueTenants failed for ${t.id}`, err);
      failed.push(`${t.name}: ${(err as Error).message}`);
    }
  }
  return { purged, failed };
}
