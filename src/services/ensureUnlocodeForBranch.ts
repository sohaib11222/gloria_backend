import { prisma } from "../data/prisma.js";

/**
 * If the code is missing from the UN/LOCODE reference table, create a minimal row (same pattern as branch import).
 * Lets admins/sources save a valid-format code and refine place/country later.
 */
export async function ensureUnlocodeRowForBranch(
  unlocodeIn: string,
  hints: { countryCode?: string | null; city?: string | null; country?: string | null }
): Promise<string> {
  const unlocode = unlocodeIn.toUpperCase().trim();
  if (!unlocode || unlocode.length < 4 || unlocode.length > 5) {
    const err = new Error("UN/LOCODE must be 4 to 5 characters (e.g. GBMAN or AEDXB)");
    (err as any).code = "INVALID_UNLOCODE_FORMAT";
    throw err;
  }
  const row = await prisma.uNLocode.findUnique({ where: { unlocode } });
  if (row) return unlocode;
  const cc = (hints.countryCode || "").toUpperCase().trim().slice(0, 2);
  const country = cc.length === 2 ? cc : unlocode.slice(0, 2);
  const placeRaw = hints.city?.trim() || hints.country?.trim() || unlocode.slice(2) || "Location";
  const place = placeRaw.slice(0, 200) || "Location";
  await prisma.uNLocode.create({
    data: {
      unlocode,
      country,
      place,
      iataCode: null,
      latitude: null,
      longitude: null,
    },
  });
  return unlocode;
}
