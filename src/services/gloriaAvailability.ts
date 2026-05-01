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

function stringifyAttrRecord(a: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!a || typeof a !== "object") return out;
  for (const [k, v] of Object.entries(a)) {
    if (v == null || v === "") continue;
    out[String(k)] = typeof v === "string" ? v : String(v);
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
      const desc = String(a.ItemDescription || a.Description || "").trim();
      const code = String(a.Code || "").trim();
      return {
        code,
        header: desc || code || "",
        details: desc || undefined,
        price: a.Price != null ? String(a.Price) : undefined,
        excess: a.Excess != null ? String(a.Excess) : undefined,
        deposit: a.Deposit != null ? String(a.Deposit) : undefined,
        currency: a.Currency != null ? String(a.Currency).trim() : undefined,
        mandatory: "Yes",
      };
    });
    const notIncludedRaw = asArray(car?.notincludedinprice?.Item || car?.notincludedinprice?.item).map((x: any) => {
      const a = attrs(x);
      const desc = String(a.ItemDescription || a.Description || "").trim();
      const code = String(a.Code || "").trim();
      const cover = a.CoverAmount ?? a.cover_amount;
      return {
        code,
        header: desc || code || "",
        details: desc || undefined,
        price: a.Price != null ? String(a.Price) : undefined,
        excess: a.Excess != null ? String(a.Excess) : undefined,
        deposit: a.Deposit != null ? String(a.Deposit) : undefined,
        cover_amount: cover != null ? String(cover) : undefined,
        currency: a.Currency != null ? String(a.Currency).trim() : undefined,
        mandatory: "No",
      };
    });
    const included = includedRaw.filter((x) => x.header || x.code);
    const notIncluded = notIncludedRaw.filter((x) => x.header || x.code);

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
          currency: a.Currency ? String(a.Currency).trim() : undefined,
          long_description: a.LongDescription ? String(a.LongDescription) : undefined,
          charge: { Amount: amount },
        };
      })
      .filter(Boolean) as any[];

    const gloria_pricing_attributes = stringifyAttrRecord(pricing);
    const gloria_vehdetails_attributes = stringifyAttrRecord(veh);

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
      availability_status: "Available",
      veh_id: offerRef || undefined,
      picture_url: veh.ImageURL || undefined,
      door_count: veh.Doors ? String(veh.Doors) : undefined,
      baggage:
        veh.BagsSmall || veh.BagsMedium
          ? [veh.BagsSmall, veh.BagsMedium].filter(Boolean).join(" / ")
          : undefined,
      vehicle_category: acriss || undefined,
      transmission_type: veh.Transmission || undefined,
      veh_terms_included: included.length ? included : undefined,
      veh_terms_not_included: notIncluded.length ? notIncluded : undefined,
      priced_equips: pricedEquips.length ? pricedEquips : undefined,
      total_charge: { rate_total_amount: String(totalGross), currency_code: currency, tax_inclusive: "true" },
      gloria_pricing_attributes:
        Object.keys(gloria_pricing_attributes).length > 0 ? gloria_pricing_attributes : undefined,
      gloria_vehdetails_attributes:
        Object.keys(gloria_vehdetails_attributes).length > 0 ? gloria_vehdetails_attributes : undefined,
    });
  }

  return offers;
}
