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
    details.Availcar ??
    details.availcar ??
    (details as any).AvailCar;
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

/** First XML child whose tag matches one of the names (case-insensitive). */
function pickChildCI(obj: any, ...names: string[]): any {
  if (!obj || typeof obj !== "object") return undefined;
  const want = new Set(names.map((n) => n.toLowerCase()));
  for (const k of Object.keys(obj)) {
    if (want.has(k.toLowerCase())) return (obj as any)[k];
  }
  return undefined;
}

/** Unwrap [node] or pick first non-empty object element from an array. */
function unwrapOne(node: any): any {
  if (node == null) return undefined;
  if (Array.isArray(node)) {
    for (const el of node) {
      if (el != null && typeof el === "object" && Object.keys(el).length > 0) return el;
    }
    return node[0];
  }
  return node;
}

/** PHP-decoded rows sometimes appear as { "0": { real availcar } } (single numeric wrapper). Strip repeatedly. */
function unwrapPhpNumericSingleKeyShell(node: any, maxHops = 10): any {
  let cur = node;
  for (let h = 0; h < maxHops && cur && typeof cur === "object"; h++) {
    const keys = Object.keys(cur).filter((k) => k !== "#text" && k !== "#comment" && !k.startsWith(":"));
    if (keys.length !== 1 || !/^\d+$/.test(keys[0])) break;
    const inner = unwrapOne((cur as any)[keys[0]]);
    if (!inner || inner === cur) break;
    cur = inner;
  }
  return cur;
}

/**
 * All attribute-like fields for an XML/JSON element: grouped @attributes plus
 * scalar fields merged on the node (some APIs / parsers omit @attributes).
 */
function readElementAttrs(node: any): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (rec: Record<string, any>) => {
    for (const [k, v] of Object.entries(rec)) {
      if (v == null || v === "") continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        out[String(k)] = typeof v === "string" ? v : String(v);
      }
    }
  };
  const n = unwrapOne(node);
  if (!n || typeof n !== "object") return out;
  // PHP var_dump trees use ["attr"]=> { ... } instead of @attributes
  const phpAttr = (n as any).attr;
  if (phpAttr && typeof phpAttr === "object") add(phpAttr as any);
  // fast-xml-parser may expose internal attr map as ":@"
  const internalAttrs = (n as any)[":@"];
  if (internalAttrs && typeof internalAttrs === "object") {
    const grouped = internalAttrs["@attributes"];
    if (grouped && typeof grouped === "object") add(grouped as any);
    else add(internalAttrs as any);
  }
  add(attrs(n) as any);
  for (const [k, v] of Object.entries(n)) {
    if (k === "@attributes" || k === "#text" || k === ":@" || k.startsWith(":")) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      if (out[k] == null || out[k] === "") out[k] = String(v);
    }
  }
  // Element children that are plain text leaves: { Make: "SKODA" } already handled; { Make: { "#text": "x" } } }
  for (const [k, v] of Object.entries(n)) {
    if (k === "@attributes" || k === "#text" || k === ":@" || k.startsWith(":")) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const t = (v as any)["#text"];
      if (typeof t === "string" || typeof t === "number" || typeof t === "boolean") {
        if (out[k] == null || out[k] === "") out[k] = String(t);
      }
    }
  }
  return out;
}

/** Unwrap <vehdetails><vehdetails @attrs/></vehdetails> style nesting (max 4 hops). */
function peelSameNameWrapper(node: any, ...names: string[]): any {
  let cur = unwrapOne(node);
  for (let hop = 0; hop < 4 && cur && typeof cur === "object"; hop++) {
    const next = unwrapOne(pickChildCI(cur, ...names));
    if (!next || next === cur) break;
    cur = next;
  }
  return cur;
}

function bagGet(bag: Record<string, string>, ...keys: string[]): string | undefined {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(bag)) lower[k.toLowerCase()] = v;
  for (const key of keys) {
    const v = lower[key.toLowerCase()];
    if (v != null && v !== "") return v;
  }
  return undefined;
}

const SKIP_CHILD_KEYS = new Set([
  "pricing",
  "includedinprice",
  "notincludedinprice",
  "optionalextras",
  "terms",
  "item",
  "@attributes",
  "#text",
]);

/** If vehdetails path is empty, pick the first child object that looks like vehicle specs. */
function fallbackAttrBagFromCar(car: any): Record<string, string> {
  if (!car || typeof car !== "object") return {};
  for (const [k, v] of Object.entries(car)) {
    if (SKIP_CHILD_KEYS.has(k.toLowerCase())) continue;
    const u = unwrapOne(v);
    if (!u || typeof u !== "object") continue;
    const bag = readElementAttrs(u);
    if (bagGet(bag, "Make", "Model", "ACRISS")) return bag;
  }
  return {};
}

/** Real availcar rows have ACRISS (or vehdetails / pricing); drops Terms.Item noise if any slip through. */
function looksLikeAvailCar(car: any): boolean {
  if (!car || typeof car !== "object") return false;
  const bag = readElementAttrs(car);
  if (bagGet(bag, "ACRISS", "VehicleClass")) return true;
  if (pickChildCI(car, "vehdetails", "Vehdetails", "VehDetails", "vehicle", "Vehicle")) return true;
  if (pickChildCI(car, "pricing", "Pricing")) return true;
  return false;
}

function toNum(v: any): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v !== "string") return 0;
  const n = Number(v.replace(/,/g, "."));
  return Number.isFinite(n) ? n : 0;
}

function uniqueTermsByCode<T extends { code?: string }>(rows: T[]): T[] {
	const out: T[] = [];
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
  const rawCars = extractAvailCarsFromDetails(details);
  const carsFiltered = rawCars.filter(looksLikeAvailCar);
  const cars = carsFiltered.length > 0 ? carsFiltered : rawCars;
  const offers: Offer[] = [];

  for (let i = 0; i < cars.length; i++) {
    const car = unwrapPhpNumericSingleKeyShell(cars[i]);
    if (car == null || typeof car !== "object") continue;
    const vehNode = peelSameNameWrapper(
      pickChildCI(car, "vehdetails", "Vehdetails", "VehDetails", "vehicle", "Vehicle"),
      "vehdetails",
      "Vehdetails",
      "VehDetails"
    );
    const pricingNode = peelSameNameWrapper(
      pickChildCI(car, "pricing", "Pricing"),
      "pricing",
      "Pricing"
    );
    const carBag = readElementAttrs(car);
    let veh = readElementAttrs(vehNode);
    if (!Object.keys(veh).length) veh = fallbackAttrBagFromCar(car);
    const pricing = readElementAttrs(pricingNode);
    const acriss = String(
      bagGet(carBag, "ACRISS", "Code", "VehicleClass") ||
        bagGet(veh, "ACRISS", "Code") ||
        ""
    ).trim();
    const make = String(bagGet(veh, "Make", "make") || "").trim();
    const model = String(bagGet(veh, "Model", "model") || "").trim();
    const name = `${make} ${model}`.trim();

    const incBlock = unwrapOne(pickChildCI(car, "includedinprice", "includedInPrice", "IncludedInPrice"));
    const incItemRaw = incBlock?.Item ?? incBlock?.item ?? incBlock;
    const includedRaw = asArray(incItemRaw).map((x: any) => {
      const a = readElementAttrs(unwrapOne(x));
      const desc = String(bagGet(a, "ItemDescription", "Description", "Header") || "").trim();
      const code = String(bagGet(a, "Code", "code") || "").trim();
      return {
        code,
        header: desc || code || "",
        details: desc || undefined,
        price: bagGet(a, "Price", "price"),
        excess: bagGet(a, "Excess", "excess"),
        deposit: bagGet(a, "Deposit", "deposit"),
        currency: bagGet(a, "Currency", "currency"),
        mandatory: "Yes",
      };
    });
    const niBlock = unwrapOne(pickChildCI(car, "notincludedinprice", "notIncludedInPrice", "NotIncludedInPrice"));
    const niItemRaw = niBlock?.Item ?? niBlock?.item ?? niBlock;
    const notIncludedRaw = asArray(niItemRaw).map((x: any) => {
      const a = readElementAttrs(unwrapOne(x));
      const desc = String(bagGet(a, "ItemDescription", "Description", "Header") || "").trim();
      const code = String(bagGet(a, "Code", "code") || "").trim();
      const cover = bagGet(a, "CoverAmount", "cover_amount", "Coveramount");
      return {
        code,
        header: desc || code || "",
        details: desc || undefined,
        price: bagGet(a, "Price", "price"),
        excess: bagGet(a, "Excess", "excess"),
        deposit: bagGet(a, "Deposit", "deposit"),
        cover_amount: cover,
        currency: bagGet(a, "Currency", "currency"),
        mandatory: "No",
      };
    });
    const included = uniqueTermsByCode(
      includedRaw.filter((x) => x.header || x.code),
    );
    const notIncluded = uniqueTermsByCode(
      notIncludedRaw.filter((x) => x.header || x.code),
    );

    const termsBlock = unwrapOne(pickChildCI(car, "Terms", "terms"));
    const termItemRaw = termsBlock?.Item ?? termsBlock?.item ?? termsBlock;
    const gloria_terms = asArray(termItemRaw)
      .map((x: any) => {
        const a = readElementAttrs(unwrapOne(x));
        const code = bagGet(a, "Code", "code") || "";
        const name = bagGet(a, "Name", "name") || "";
        const description = bagGet(a, "Description", "description") || "";
        if (!code && !name && !description) return null;
        return {
          "@attributes": {
            ...(code ? { Code: code } : {}),
            ...(name ? { Name: name } : {}),
            ...(description ? { Description: description } : {}),
          },
        };
      })
      .filter(Boolean) as Array<{ "@attributes": Record<string, string> }>;

    const ox = pickChildCI(car, "OptionalExtras", "optionalextras", "optionalExtras");
    const extraItems = asArray(ox?.Item ?? ox?.item ?? ox);
    const pricedEquips = extraItems
      .map((x: any) => {
        const a = readElementAttrs(unwrapOne(x));
        const description = String(
          bagGet(a, "ItemDescription", "Description", "Name", "EquipType", "Code") || ""
        ).trim();
        const amount =
          bagGet(a, "Price", "Amount", "TotalGross", "DailyGross") ?? "0.00";
        if (!description) return null;
        return {
          description,
          equip_type: bagGet(a, "Code", "EquipType") || undefined,
          vendor_equip_id: bagGet(a, "Code", "EquipType") || undefined,
          currency: bagGet(a, "Currency", "currency") || undefined,
          long_description:
            bagGet(a, "Description", "LongDescription", "long_description") ||
            undefined,
          charge: { Amount: amount },
        };
      })
      .filter(Boolean) as any[];

    const gloria_pricing_attributes = stringifyAttrRecord(pricing);
    const gloria_vehdetails_attributes = stringifyAttrRecord({ ...carBag, ...veh });

    const totalGross =
      bagGet(pricing, "TotalGross", "Total", "DailyGross", "RateTotalAmount") ?? "0";
    const currency = String(bagGet(pricing, "Currency", "currency") || "EUR").trim();
    const offerRef = String(
      bagGet(pricing, "CarOrderID", "SupplierOfferRef", "OfferRef", "VehID") ||
        `${acriss || "CAR"}-${i + 1}`
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
      picture_url: bagGet(veh, "ImageURL", "imageurl", "PictureURL") || undefined,
      door_count: bagGet(veh, "Doors", "door_count") || undefined,
      baggage: (() => {
        const bs = bagGet(veh, "BagsSmall", "bagssmall");
        const bm = bagGet(veh, "BagsMedium", "bagsmedium");
        return bs || bm ? [bs, bm].filter(Boolean).join(" / ") : undefined;
      })(),
      vehicle_category: acriss || undefined,
      transmission_type: bagGet(veh, "Transmission", "transmission") || undefined,
      veh_terms_included: included.length ? included : undefined,
      veh_terms_not_included: notIncluded.length ? notIncluded : undefined,
      priced_equips: pricedEquips.length ? pricedEquips : undefined,
      total_charge: { rate_total_amount: String(totalGross), currency_code: currency, tax_inclusive: "true" },
      gloria_pricing_attributes:
        Object.keys(gloria_pricing_attributes).length > 0 ? gloria_pricing_attributes : undefined,
      gloria_vehdetails_attributes:
        Object.keys(gloria_vehdetails_attributes).length > 0 ? gloria_vehdetails_attributes : undefined,
      gloria_terms: gloria_terms.length ? gloria_terms : undefined,
    });
  }

  return offers;
}
