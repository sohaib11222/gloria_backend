import type { Offer } from "../adapters/registry.js";

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function attrs(node: any): Record<string, any> {
  if (!node || typeof node !== "object") return {};
  const a = node["@attributes"];
  return a && typeof a === "object" ? a : {};
}

function toNum(v: any): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v !== "string") return 0;
  const n = Number(v.replace(/,/g, "."));
  return Number.isFinite(n) ? n : 0;
}

function uniqueByCode(rows: Array<{ code?: string; [k: string]: any }>) {
  const out: Array<{ code?: string; [k: string]: any }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const code = (row.code || "").trim().toUpperCase();
    if (!code) {
      out.push(row);
      continue;
    }
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(row);
  }
  return out;
}

/**
 * Parse GLORIA availability response tree:
 *   root.VehAvairsdetails.availcars[]
 * Supports object parsed from XML / JSON / PHP var_dump.
 */
export function parseGloriaAvailabilityOffers(
  root: any,
  sourceId: string,
  criteria: { agreement_ref?: string }
): Offer[] {
  const details = root?.VehAvairsdetails || root?.VehAvaildetails || root?.vehavairsdetails;
  const cars = asArray(details?.availcars || details?.AvailCars);
  const offers: Offer[] = [];

  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    const carAttrs = attrs(car);
    const veh = attrs(car?.vehdetails);
    const pricing = attrs(car?.pricing);
    const acriss = String(carAttrs.ACRISS || carAttrs.Code || veh.ACRISS || "").trim();
    const make = String(veh.Make || "").trim();
    const model = String(veh.Model || "").trim();
    const name = `${make} ${model}`.trim();

    const includedRaw = asArray(car?.includedinprice?.Item || car?.includedinprice?.item).map((x: any) => {
      const a = attrs(x);
      const header = String(a.ItemDescription || a.Description || "").trim();
      return {
        code: String(a.Code || "").trim(),
        header,
        details: header || undefined,
        price: a.Price || "0.00",
        excess: a.Excess || undefined,
        deposit: a.Deposit || undefined,
        mandatory: "Yes",
      };
    });
    const notIncludedRaw = asArray(car?.notincludedinprice?.Item || car?.notincludedinprice?.item).map((x: any) => {
      const a = attrs(x);
      const header = String(a.ItemDescription || a.Description || "").trim();
      return {
        code: String(a.Code || "").trim(),
        header,
        details: header || undefined,
        price: a.Price || undefined,
        excess: a.Excess || undefined,
        deposit: a.Deposit || undefined,
        mandatory: "No",
      };
    });
    const included = uniqueByCode(includedRaw.filter((x) => x.header || x.code));
    const notIncluded = uniqueByCode(notIncludedRaw.filter((x) => x.header || x.code));

    const extraItems = asArray(
      car?.OptionalExtras?.Item ||
        car?.OptionalExtras?.item ||
        car?.optionalextras?.Item ||
        car?.optionalextras?.item
    );
    const pricedEquips = extraItems
      .map((x: any) => {
        const a = attrs(x);
        const description = String(
          a.ItemDescription || a.Description || a.Name || a.EquipType || a.Code || ""
        ).trim();
        const amount = a.Price ?? a.Amount ?? a.TotalGross ?? a.DailyGross ?? "0.00";
        if (!description) return null;
        return {
          description,
          equip_type: a.Code || a.EquipType || undefined,
          vendor_equip_id: a.Code || undefined,
          charge: { Amount: amount },
        };
      })
      .filter(Boolean) as any[];

    const totalGross = pricing.TotalGross ?? pricing.Total ?? pricing.DailyGross ?? "0";
    const currency = String(pricing.Currency || "EUR").trim();
    const offerRef = String(
      pricing.CarOrderID || pricing.SupplierOfferRef || pricing.OfferRef || `${acriss || "CAR"}-${i + 1}`
    ).trim();

    offers.push({
      source_id: sourceId,
      agreement_ref: criteria.agreement_ref || "",
      vehicle_class: acriss || "",
      vehicle_make_model: name || offerRef,
      rate_plan_code: "",
      currency,
      total_price: toNum(totalGross),
      supplier_offer_ref: offerRef || `${sourceId}-${i + 1}`,
      availability_status: "AVAILABLE",
      veh_id: offerRef || undefined,
      picture_url: veh.ImageURL || undefined,
      door_count: veh.Doors || undefined,
      baggage: [veh.BagsSmall, veh.BagsMedium].filter(Boolean).join("/") || undefined,
      vehicle_category: acriss || undefined,
      transmission_type: veh.Transmission || undefined,
      veh_terms_included: included.length ? included : undefined,
      veh_terms_not_included: notIncluded.length ? notIncluded : undefined,
      priced_equips: pricedEquips.length ? pricedEquips : undefined,
      total_charge: { rate_total_amount: String(totalGross), currency_code: currency, tax_inclusive: "true" },
    });
  }

  return offers;
}
