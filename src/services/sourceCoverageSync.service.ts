import { prisma } from "../data/prisma.js";
import { getAdapterForSource } from "../adapters/registry.js";

export interface SyncSourceCoverageResult {
  added: number;
  removed: number;
  total: number;
}

/**
 * Pull locations from the source adapter, map to UN/LOCODEs, and persist SourceLocation rows.
 * Shared by gRPC SyncSourceCoverage and HTTP POST /coverage/source/:id/sync (no localhost gRPC hop).
 */
export async function syncSourceCoverage(
  sourceId: string
): Promise<SyncSourceCoverageResult> {
  const sid = String(sourceId || "").trim();
  if (!sid) {
    const err: any = new Error("source_id is required");
    err.code = 3;
    throw err;
  }

  let src: any = await prisma.company
    .findFirst({ where: { id: sid }, select: { id: true, type: true } })
    .catch(() => null);

  if (!src) {
    const anyUpper: any =
      await prisma.$queryRaw`SELECT id, type FROM Company WHERE id = ${sid} LIMIT 1`;
    src = Array.isArray(anyUpper) ? anyUpper[0] : null;
    if (!src) {
      const anyLower: any = await prisma.$queryRawUnsafe(
        "SELECT id, type FROM company WHERE id = ? LIMIT 1",
        sid
      );
      src = Array.isArray(anyLower) ? anyLower[0] : null;
    }
  }
  if (!src || src.type !== "SOURCE") {
    const err: any = new Error("Invalid source");
    err.code = 3;
    throw err;
  }

  const adapter = await getAdapterForSource(sid);
  const latest: string[] = await adapter.locations();

  const known = await prisma.uNLocode.findMany({
    where: { unlocode: { in: latest } },
    select: { unlocode: true },
  });
  const validSet = new Set(known.map((k: any) => k.unlocode));

  const before = await prisma.sourceLocation.count({
    where: { sourceId: sid },
  });

  // Avoid `in: []` / NOT edge cases in SQL generators when nothing is valid
  if (validSet.size === 0) {
    await prisma.sourceLocation.deleteMany({
      where: { sourceId: sid },
    });
  } else {
    await prisma.sourceLocation.deleteMany({
      where: {
        sourceId: sid,
        NOT: { unlocode: { in: Array.from(validSet) } },
      },
    });
  }
  const afterDelete = await prisma.sourceLocation.count({
    where: { sourceId: sid },
  });
  const removed = Math.max(0, before - afterDelete);

  const toAdd = Array.from(validSet).map((u) => ({
    sourceId: sid,
    unlocode: u,
  }));
  if (toAdd.length) {
    await prisma.sourceLocation.createMany({
      data: toAdd,
      skipDuplicates: true,
    });
  }
  const total = await prisma.sourceLocation.count({
    where: { sourceId: sid },
  });
  const added = Math.max(0, total - afterDelete);

  return { added, removed, total };
}
