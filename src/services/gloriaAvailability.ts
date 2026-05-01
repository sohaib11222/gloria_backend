import type { Offer } from "../adapters/registry.js";

/**
 * Normalize XML/JSON/PHP-decoded values to a real array.
 * - XML fast-xml-parser usually repeats sibling tags into an array.
 * - JSON / some decoders use { "0": car, "1": car, ... } instead of [] — plain `asArray` would wrap
 *   the whole object as one element (one bogus offer like "CAR-1").
 */
function asArray<T = any>(v: T | T[] | Record<string, any> | undefined | null): T[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "object") {
    const keys = Object.keys(v as object);
    const numericKeys = keys.filter((k) => /^\d+$/.test(k));
    if (numericKeys.length > 0) {
      return numericKeys.sort((a, b) => Number(a) - Number(b)).map((k) => (v as any)[k]) as T[];
    }
  }
  return [v] as T[];
}

/** Pull availcars[] from VehAvairsdetails (or sibling shapes). */
function extractAvailCarsFromDetails(details: any): any[] {
  if (!details || typeof details !== "object") return [];
  const raw =
    details.availcars ??
    details.AvailCars ??
    details.AVAILCARS ??
    (details as any).availcar;
  if (raw == null) return [];
  let list = asArray(raw);
  // One XML element <availcars> wrapping many <car> (or similar) children
  if (list.length === 1 && list[0] && typeof list[0] === "object") {
    const shell = list[0] as any;
    const nested =
      shell.car ??
      shell.Car ??
      shell.availcar ??
      shell.availcars ??
      shell.Vehicle ??
      shell.vehicle;
    const nestedList = nested != null ? asArray(nested) : [];
    if (nestedList.length > 1) return nestedList;
  }
  return list;
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
  const details =
    root?.VehAvairsdetails ||
    root?.VehAvaildetails ||
    root?.vehavairsdetails ||
    (root?.availcars || root?.AvailCars ? root : null);
  const cars = extractAvailCarsFromDetails(details);
  const offers: Offer[] = [];

  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    if (car == null || typeof car !== "object") continue;
    const carAttrs = attrs(car);
    const veh = attrs(car?.vehdetails || car?.Vehdetails || car?.VehDetails);
    const pricing = attrs(car?.pricing || car?.Pricing);
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
