import { prisma } from "../data/prisma.js";
import { isSourceUsingMockAdapter } from "../adapters/registry.js";

export interface AgreementLocationsResult {
  items: Array<{ unlocode: string; allowed: boolean; isMock?: boolean }>;
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
    const base = await prisma.sourceLocation.findMany({
      where: { sourceId: ag.sourceId },
      select: { unlocode: true, isMock: true },
    });
    const baseSet = new Set<string>(base.map((b) => b.unlocode));
    const mockLocationsSet = new Set<string>(
      base.filter((b) => (b as any).isMock === true).map((b) => b.unlocode)
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

    // If no specific source locations configured, inherit global UN/LOCODE list
    if (finalSet.size === 0) {
      const all = await prisma.uNLocode.findMany({ select: { unlocode: true } });
      return { 
        items: all.map((r) => ({ unlocode: r.unlocode, allowed: true, isMock: false })), 
        inherited: true,
        hasMockData: false
      };
    }

    const items = Array.from(finalSet)
      .sort()
      .map((u) => ({ 
        unlocode: u, 
        allowed: true,
        isMock: isMockSource || mockLocationsSet.has(u)
      }));
    
    return { 
      items, 
      inherited: false,
      hasMockData: isMockSource || items.some(i => i.isMock)
    };
  },

  async validateAgreementCoverage(agreementId: string, pickupUnlocode: string, dropoffUnlocode: string): Promise<boolean> {
    const result = await this.getAgreementLocations(agreementId);
    const set = new Set(result.items.map((i) => i.unlocode));
    return set.has(pickupUnlocode) && set.has(dropoffUnlocode);
  },
};


