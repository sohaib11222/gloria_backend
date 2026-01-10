import { prisma } from "../data/prisma.js";

export interface AgreementLocationsResult {
  items: Array<{ unlocode: string; allowed: boolean }>;
  inherited: boolean;
}

export const LocationsService = {
  async getAgreementLocations(agreementId: string): Promise<AgreementLocationsResult> {
    const ag = await prisma.agreement.findUnique({ where: { id: agreementId } });
    if (!ag) return { items: [], inherited: false };

    // Base coverage from source
    const base = await prisma.sourceLocation.findMany({
      where: { sourceId: ag.sourceId },
      select: { unlocode: true },
    });
    const baseSet = new Set<string>(base.map((b) => b.unlocode));

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
      return { items: all.map((r) => ({ unlocode: r.unlocode, allowed: true })), inherited: true };
    }

    const items = Array.from(finalSet)
      .sort()
      .map((u) => ({ unlocode: u, allowed: true }));
    return { items, inherited: false };
  },

  async validateAgreementCoverage(agreementId: string, pickupUnlocode: string, dropoffUnlocode: string): Promise<boolean> {
    const result = await this.getAgreementLocations(agreementId);
    const set = new Set(result.items.map((i) => i.unlocode));
    return set.has(pickupUnlocode) && set.has(dropoffUnlocode);
  },
};


