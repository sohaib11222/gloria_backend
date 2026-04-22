import { prisma } from "../data/prisma.js";

export type CoverageListLoc = {
  unlocode: string;
  place: string;
  country: string;
  iataCode: string | null;
  latitude: number | null;
  longitude: number | null;
  branchCode?: string;
};

export type CoverageListItem = {
  unlocode: string;
  isMock: boolean;
  locationProvenance: "UNLOCODE_MASTER" | "BRANCH" | null;
  location: CoverageListLoc | null;
};

type LocSelect = {
  unlocode: string;
  place: string;
  country: string;
  iataCode: string | null;
  latitude: number | null;
  longitude: number | null;
} | null;

type SourceLocInput = {
  unlocode: string;
  isMock: boolean;
  loc: LocSelect;
};

type BranchPick = {
  id: string;
  branchCode: string;
  name: string;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  natoLocode: string | null;
};

function branchCandidatesForUnlocode(
  u: string,
  byNato: Map<string, BranchPick[]>,
  byCode: Map<string, BranchPick[]>
): BranchPick[] {
  const key = u.toUpperCase();
  const seen = new Map<string, BranchPick>();
  for (const b of byNato.get(key) || []) seen.set(b.id, b);
  for (const b of byCode.get(key) || []) seen.set(b.id, b);
  return [...seen.values()];
}

function pickBestBranch(cands: BranchPick[]): BranchPick | null {
  if (!cands.length) return null;
  const score = (b: BranchPick) =>
    (String(b.status || "").toUpperCase() === "ACTIVE" ? 4 : 0) +
    (b.name?.trim() ? 2 : 0) +
    (b.city?.trim() ? 1 : 0) +
    (b.latitude != null && b.longitude != null ? 1 : 0);
  return [...cands].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/**
 * Build coverage list rows: prefer Gloria UNLocode master; otherwise map from Branch (natoLocode or branchCode).
 */
export async function buildCoverageListItems(
  sourceId: string,
  sourceLocations: SourceLocInput[]
): Promise<CoverageListItem[]> {
  const codesUpper = [...new Set(sourceLocations.map((s) => s.unlocode.toUpperCase()))];
  const codeVariants = [...new Set(codesUpper.flatMap((c) => [c, c.toLowerCase()]))];

  const branches = await prisma.branch.findMany({
    where: {
      sourceId,
      OR: [{ natoLocode: { in: codeVariants } }, { branchCode: { in: codeVariants } }],
    },
    select: {
      id: true,
      branchCode: true,
      name: true,
      city: true,
      country: true,
      countryCode: true,
      latitude: true,
      longitude: true,
      status: true,
      natoLocode: true,
    },
  });

  const byNato = new Map<string, BranchPick[]>();
  const byCode = new Map<string, BranchPick[]>();
  for (const b of branches) {
    if (b.natoLocode) {
      const k = b.natoLocode.toUpperCase();
      if (!byNato.has(k)) byNato.set(k, []);
      byNato.get(k)!.push(b);
    }
    if (b.branchCode) {
      const k = b.branchCode.toUpperCase();
      if (!byCode.has(k)) byCode.set(k, []);
      byCode.get(k)!.push(b);
    }
  }

  return sourceLocations.map((sl) => {
    if (sl.loc) {
      return {
        unlocode: sl.unlocode,
        isMock: sl.isMock,
        locationProvenance: "UNLOCODE_MASTER" as const,
        location: {
          unlocode: sl.loc.unlocode,
          place: sl.loc.place,
          country: sl.loc.country,
          iataCode: sl.loc.iataCode,
          latitude: sl.loc.latitude,
          longitude: sl.loc.longitude,
        },
      };
    }
    const cands = branchCandidatesForUnlocode(sl.unlocode, byNato, byCode);
    const br = pickBestBranch(cands);
    if (br) {
      const country = (br.countryCode || br.country || "").trim();
      const place = (br.name?.trim() || br.city?.trim() || br.branchCode || sl.unlocode).trim();
      return {
        unlocode: sl.unlocode,
        isMock: sl.isMock,
        locationProvenance: "BRANCH" as const,
        location: {
          unlocode: sl.unlocode,
          place,
          country,
          iataCode: null,
          latitude: br.latitude ?? null,
          longitude: br.longitude ?? null,
          branchCode: br.branchCode,
        },
      };
    }
    return {
      unlocode: sl.unlocode,
      isMock: sl.isMock,
      locationProvenance: null,
      location: null,
    };
  });
}
