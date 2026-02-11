/**
 * Parse CSV or Excel content into branch objects compatible with import/upload.
 * Used for branch endpoint format CSV/EXCEL and for upload-branches with CSV/Excel files.
 *
 * Expected CSV/Excel column names (case-insensitive, optional unless noted):
 * - Branchcode or Code (required for identification)
 * - Name
 * - CountryCode (ISO 2-letter, e.g. AE, US)
 * - Country (country name)
 * - City or CityName
 * - AddressLine or Address
 * - PostalCode
 * - Latitude, Longitude
 * - AtAirport (true/false)
 * - LocationType, CollectionType
 * - Phone or Telephone, Email or EmailAddress
 */

/** Normalize header: lowercase, trim, map common aliases */
function normalizeHeader(h: string): string {
  const s = String(h || "").trim().toLowerCase();
  const map: Record<string, string> = {
    code: "branchcode",
    branch_code: "branchcode",
    branchcode: "branchcode",
    name: "name",
    countrycode: "countrycode",
    country_code: "countrycode",
    country: "country",
    city: "city",
    cityname: "city",
    city_name: "city",
    addressline: "addressline",
    address_line: "addressline",
    address: "addressline",
    postalcode: "postalcode",
    postal_code: "postalcode",
    latitude: "latitude",
    lat: "latitude",
    longitude: "longitude",
    lon: "longitude",
    lng: "longitude",
    atairport: "atairport",
    at_airport: "atairport",
    locationtype: "locationtype",
    location_type: "locationtype",
    collectiontype: "collectiontype",
    collection_type: "collectiontype",
    phone: "phone",
    telephone: "phone",
    email: "email",
    emailaddress: "email",
    email_address: "email",
  };
  return map[s] || s;
}

/** Parse a single CSV line respecting quoted fields */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i++;
      let field = "";
      while (i < line.length) {
        if (line[i] === "\\") {
          i++;
          if (i < line.length) field += line[i++];
          continue;
        }
        if (line[i] === '"') {
          i++;
          if (line[i] === '"') {
            field += '"';
            i++;
            continue;
          }
          break;
        }
        field += line[i++];
      }
      out.push(field);
      if (line[i] === ",") i++;
      continue;
    }
    const comma = line.indexOf(",", i);
    if (comma === -1) {
      out.push(line.slice(i).trim());
      break;
    }
    out.push(line.slice(i, comma).trim());
    i = comma + 1;
  }
  return out;
}

/**
 * Parse CSV text (header row + data rows) into branch-like objects.
 * defaultCountryCode: used when a row has no CountryCode column or value.
 */
export function parseCsvToBranches(
  csvText: string,
  defaultCountryCode?: string | null
): any[] {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine).map(normalizeHeader);
  const branchcodeIdx = headers.indexOf("branchcode");
  if (branchcodeIdx === -1) return [];

  const branches: any[] = [];
  for (let r = 1; r < lines.length; r++) {
    const values = parseCsvLine(lines[r]);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] !== undefined ? String(values[i]).trim() : "";
    });

    const branchCode = row.branchcode || row.code || "";
    const name = row.name || "";
    const countryCode = row.countrycode || defaultCountryCode || "";
    const country = row.country || "";
    const city = row.city || "";
    const addressLine = row.addressline || "";
    const postalCode = row.postalcode || "";
    const lat = row.latitude ? parseFloat(row.latitude) : NaN;
    const lon = row.longitude ? parseFloat(row.longitude) : NaN;
    const atAirport = (row.atairport || "").toLowerCase();
    const locationType = row.locationtype || "";
    const collectionType = row.collectiontype || "";
    const phone = row.phone || "";
    const email = row.email || "";

    branches.push({
      Branchcode: branchCode || undefined,
      Code: branchCode || undefined,
      Name: name || undefined,
      AtAirport: atAirport === "true" || atAirport === "1" ? "true" : atAirport === "false" || atAirport === "0" ? "false" : null,
      LocationType: locationType || undefined,
      CollectionType: collectionType || undefined,
      Telephone: phone ? { attr: { PhoneNumber: phone }, PhoneNumber: phone } : undefined,
      EmailAddress: email || undefined,
      Latitude: !Number.isNaN(lat) ? lat : undefined,
      Longitude: !Number.isNaN(lon) ? lon : undefined,
      Address: {
        AddressLine: addressLine || undefined,
        CityName: city || undefined,
        PostalCode: postalCode || undefined,
        CountryName: countryCode || country
          ? { value: country || countryCode, attr: { Code: (countryCode || "").toUpperCase().slice(0, 3) } }
          : undefined,
      },
      countryCode: countryCode || undefined,
      country: country || undefined,
      city: city || undefined,
      addressLine: addressLine || undefined,
      postalCode: postalCode || undefined,
      phone: phone || undefined,
      email: email || undefined,
    });
  }
  return branches;
}

/**
 * Parse Excel file buffer (xlsx/xls) first sheet into branch-like objects.
 * Requires optional dependency "xlsx". If not installed, returns [] and logs.
 * defaultCountryCode: used when a row has no CountryCode.
 */
export async function parseExcelToBranches(
  buffer: Buffer,
  defaultCountryCode?: string | null
): Promise<any[]> {
  try {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) return [];
    const sheet = wb.Sheets[firstSheetName];
    const data: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    if (data.length < 2) return [];

    const headerRow = data[0].map((c) => normalizeHeader(String(c)));
    const rows = data.slice(1);
    const branches: any[] = [];

    for (const values of rows) {
      const row: Record<string, string> = {};
      headerRow.forEach((h, i) => {
        row[h] = values[i] !== undefined && values[i] !== null ? String(values[i]).trim() : "";
      });

      const branchCode = row.branchcode || row.code || "";
      const name = row.name || "";
      const countryCode = row.countrycode || defaultCountryCode || "";
      const country = row.country || "";
      const city = row.city || "";
      const addressLine = row.addressline || "";
      const postalCode = row.postalcode || "";
      const lat = row.latitude ? parseFloat(row.latitude) : NaN;
      const lon = row.longitude ? parseFloat(row.longitude) : NaN;
      const atAirport = (row.atairport || "").toLowerCase();
      const locationType = row.locationtype || "";
      const collectionType = row.collectiontype || "";
      const phone = row.phone || "";
      const email = row.email || "";

      branches.push({
        Branchcode: branchCode || undefined,
        Code: branchCode || undefined,
        Name: name || undefined,
        AtAirport: atAirport === "true" || atAirport === "1" ? "true" : atAirport === "false" || atAirport === "0" ? "false" : null,
        LocationType: locationType || undefined,
        CollectionType: collectionType || undefined,
        Telephone: phone ? { attr: { PhoneNumber: phone }, PhoneNumber: phone } : undefined,
        EmailAddress: email || undefined,
        Latitude: !Number.isNaN(lat) ? lat : undefined,
        Longitude: !Number.isNaN(lon) ? lon : undefined,
        Address: {
          AddressLine: addressLine || undefined,
          CityName: city || undefined,
          PostalCode: postalCode || undefined,
          CountryName: countryCode || country
            ? { value: country || countryCode, attr: { Code: (countryCode || "").toUpperCase().slice(0, 3) } }
            : undefined,
        },
        countryCode: countryCode || undefined,
        country: country || undefined,
        city: city || undefined,
        addressLine: addressLine || undefined,
        postalCode: postalCode || undefined,
        phone: phone || undefined,
        email: email || undefined,
      });
    }
    return branches;
  } catch (e: any) {
    if (e?.code === "MODULE_NOT_FOUND" || e?.message?.includes("xlsx")) {
      console.warn("[branchCsvExcelParser] xlsx module not installed. Install with: npm install xlsx");
      return [];
    }
    throw e;
  }
}

/** Detect if content looks like CSV (has header line with commas and at least one data line) */
export function looksLikeCsv(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;
  const first = lines[0];
  return first.includes(",") && lines[1].includes(",");
}
