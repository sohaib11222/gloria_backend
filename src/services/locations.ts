import { prisma } from "../data/prisma.js";
import { isSourceUsingMockAdapter } from "../adapters/registry.js";

export interface AgreementLocationsResult {
  items: Array<{
    unlocode: string;
    allowed: boolean;
    isMock?: boolean;
    country?: string;
    place?: string;
    iataCode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    hasMasterRecord?: boolean;
  }>;
  inherited: boolean;
  hasMockData?: boolean;
}

export const LocationsService = {
  async getAgreementLocations(agreementId: string): Promise<AgreementLocationsResult> {
    const ag = await prisma.agreement.findUnique({ where: { id: agreementId } });
    if (!ag) return { items: [], inherited: false, hasMockData: false };

    // Check if source uses mock adapter
    const isMockSource = await isSourceUsingMockAdapter(ag.sourceId);

    // Base coverage from source
    // Note: isMock field may not exist in Prisma client until migration is run
    // Using type assertion to handle this gracefully
    const base = await prisma.sourceLocation.findMany({
      where: { sourceId: ag.sourceId },
    }) as Array<{ unlocode: string; isMock?: boolean }>;
    
    const baseSet = new Set<string>(base.map((b) => b.unlocode));
    const mockLocationsSet = new Set<string>(
      base.filter((b) => b.isMock === true).map((b) => b.unlocode)
    );

    // Overrides for agreement
    const overrides = await prisma.agreementLocationOverride.findMany({
      where: { agreementId },
    });
    const allowItems = overrides.filter((o) => o.allowed).map((o) => o.unlocode);
    const denyItems = overrides.filter((o) => !o.allowed).map((o) => o.unlocode);

    // Final = (base ∪ allow) \ deny
    const finalSet = new Set<string>(baseSet);
    for (const u of allowItems) finalSet.add(u);
    for (const u of denyItems) finalSet.delete(u);

    const enrich = (codes: string[]) =>
      prisma.uNLocode.findMany({
        where: { unlocode: { in: codes } },
        select: {
          unlocode: true,
          country: true,
          place: true,
          iataCode: true,
          latitude: true,
          longitude: true,
        },
      });

    // If no specific source locations configured, inherit global UN/LOCODE list
    if (finalSet.size === 0) {
      const all = await prisma.uNLocode.findMany({
        select: { unlocode: true, country: true, place: true, iataCode: true, latitude: true, longitude: true },
        orderBy: { unlocode: "asc" },
      });
      return {
        items: all.map((r) => ({
          unlocode: r.unlocode,
          allowed: true,
          isMock: false,
          country: r.country,
          place: r.place,
          iataCode: r.iataCode,
          latitude: r.latitude,
          longitude: r.longitude,
          hasMasterRecord: true,
        })),
        inherited: true,
        hasMockData: false,
      };
    }

    const sortedCodes = Array.from(finalSet).sort();
    const locRows = await enrich(sortedCodes);
    const byUnlocode = new Map(locRows.map((r) => [r.unlocode, r]));

    const items = sortedCodes.map((u) => {
      const meta = byUnlocode.get(u);
      return {
        unlocode: u,
        allowed: true,
        isMock: isMockSource || mockLocationsSet.has(u),
        country: meta?.country,
        place: meta?.place,
        iataCode: meta?.iataCode ?? null,
        latitude: meta?.latitude ?? null,
        longitude: meta?.longitude ?? null,
        hasMasterRecord: !!meta,
      };
    });

    return {
      items,
      inherited: false,
      hasMockData: isMockSource || items.some((i) => i.isMock),
    };
  },

  async validateAgreementCoverage(agreementId: string, pickupUnlocode: string, dropoffUnlocode: string): Promise<boolean> {
    const result = await this.getAgreementLocations(agreementId);
    const set = new Set(result.items.map((i) => i.unlocode));
    return set.has(pickupUnlocode) && set.has(dropoffUnlocode);
  },
};


