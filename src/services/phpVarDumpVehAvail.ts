/**
 * Parse PHP var_dump text into OTA VehAvailRS-shaped object for availability responses.
 * Used when the source endpoint (e.g. pricetest2.php) returns var_dump() instead of JSON.
 * Expects root to have VehAvailRSCore and VehVendorAvails; normalizes so VehVendorAvails
 * is inside VehAvailRSCore for isOtaVehAvailResponse().
 */

// Do not consume the opening " — parsePhpString expects quoteStart to point at that quote.
const STRING_VALUE_RE = /\s*string\s*\(\s*(\d+)\s*\)\s*(?=")/;
const ARRAY_VALUE_RE = /\s*array\s*\(\s*\d+\s*\)\s*\{\s*/;

function findMatchingBrace(str: string, openPos: number): number {
  let depth = 1;
  for (let i = openPos + 1; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Parse a PHP string value: string(n) "content"
 * start = position after => (start of "string(...)")
 * Returns { value, endIndex }
 */
function parsePhpString(str: string, start: number): { value: string; endIndex: number } | null {
  const match = str.slice(start).match(STRING_VALUE_RE);
  if (!match) return null;
  const len = parseInt(match[1], 10);
  const quoteStart = start + match[0].length;
  if (str[quoteStart] !== '"') return null;
  let end = quoteStart + 1;
  let i = 0;
  while (i < len && end < str.length) {
    if (str[end] === '\\') {
      end += 2;
      i++;
      continue;
    }
    if (str[end] === '"') break;
    end++;
    i++;
  }
  const value = str.slice(quoteStart + 1, end).replace(/\\(.)/g, '$1');
  return { value, endIndex: end + 1 };
}

/**
 * Parse PHP array value: array(n) { content }
 * start = position of 'a' in "array(...)"
 * Returns { value (parsed object/array), endIndex }
 */
function parsePhpArray(str: string, start: number): { value: any; endIndex: number } | null {
  const match = str.slice(start).match(ARRAY_VALUE_RE);
  if (!match) return null;
  const contentStart = start + match[0].length;
  const openBrace = contentStart - 1;
  const closeBrace = findMatchingBrace(str, openBrace);
  if (closeBrace === -1) return null;
  const content = str.slice(contentStart, closeBrace);
  const parsed = parsePhpArrayContent(content);
  return { value: parsed, endIndex: closeBrace + 1 };
}

/**
 * Parse content inside { ... } of a PHP array.
 * Entries are ["key"]=> value or [index]=> value. Value is string(n) "..." or array(n) { ... }.
 *
 * Must scan sequentially: a global regex over the whole body also matches nested ["@attributes"]=>
 * inside child arrays, which flattened GLORIA availcars and produced empty @attributes / CAR-n rows.
 */
function parsePhpArrayContent(content: string): any {
  const body = content.trim();
  if (!body) return {};

  const skipWs = (j: number) => {
    let k = j;
    while (k < body.length && /\s/.test(body[k])) k++;
    return k;
  };

  const KEY_HEAD = /^\[\s*(?:"([^"]+)"|(\d+)|([@A-Za-z_][\w]*))\s*\]\s*=>/;

  const result: Record<string | number, any> = {};
  let i = skipWs(0);

  while (i < body.length) {
    if (body[i] !== "[") {
      i = skipWs(i + 1);
      continue;
    }
    const sub = body.slice(i);
    const km = sub.match(KEY_HEAD);
    if (!km) {
      i++;
      continue;
    }
    const key: string | number =
      km[1] !== undefined ? km[1] : km[2] !== undefined ? parseInt(km[2], 10) : String(km[3]);
    let pos = i + km[0].length;
    pos = skipWs(pos);

    const rest = body.slice(pos);
    const strMatch = rest.match(STRING_VALUE_RE);
    const arrayMatch = rest.match(ARRAY_VALUE_RE);
    let value: any;
    let endPos: number;
    if (strMatch && (!arrayMatch || (strMatch.index ?? 0) <= (arrayMatch.index ?? Infinity))) {
      const parsed = parsePhpString(body, pos);
      if (!parsed) {
        i = pos + 1;
        continue;
      }
      value = parsed.value;
      endPos = parsed.endIndex;
    } else if (arrayMatch) {
      const parsed = parsePhpArray(body, pos);
      if (!parsed) {
        i = pos + 1;
        continue;
      }
      value = parsed.value;
      endPos = parsed.endIndex;
    } else {
      i = pos + 1;
      continue;
    }

    result[key] = value;
    i = skipWs(endPos);
  }

  const keyList = Object.keys(result);
  const allNumeric = keyList.length > 0 && keyList.every((k) => /^\d+$/.test(k));
  if (allNumeric) {
    const maxIdx = Math.max(...keyList.map((k) => Number(k)));
    const arr: any[] = [];
    for (let j = 0; j <= maxIdx; j++) arr.push(result[j] !== undefined ? result[j] : undefined);
    return arr;
  }
  return result;
}

/**
 * Locate the root `array(n) {` for PHP dumps.
 * Do NOT use lastIndexOf("array(", …VehAvairsdetails): the last array( before that text is often
 * `["Success"]=> array(0) { }`, not the document root — that truncated the body to `{}` and broke Gloria import.
 */
function findPhpRootArrayStart(str: string): number {
  const m = str.match(/\barray\s*\(\s*\d+\s*\)\s*\{/);
  if (m && m.index !== undefined) return m.index;
  return str.indexOf("array(");
}

/**
 * Convert PHP var_dump text to an object with VehAvailRSCore (and VehVendorAvails inside it).
 * Root in PHP often has VehAvailRSCore and VehVendorAvails as siblings; isOtaVehAvailResponse
 * expects core.VehVendorAvails, so we merge.
 */
export function convertPhpVarDumpToVehAvailRS(phpText: string): any {
  if (!phpText || typeof phpText !== 'string') {
    throw new Error('Invalid input: expected string');
  }
  const trimmed = phpText.trim().replace(/^\uFEFF/, "");
  if (!trimmed.includes('VehAvailRSCore') || !trimmed.includes('VehVendorAvails')) {
    throw new Error('PHP var_dump must contain VehAvailRSCore and VehVendorAvails');
  }

  const firstArray = findPhpRootArrayStart(trimmed);
  if (firstArray === -1) throw new Error('Could not find root array');
  const openBrace = trimmed.indexOf('{', firstArray);
  if (openBrace === -1) throw new Error('Could not find root opening brace');
  const closeBrace = findMatchingBrace(trimmed, openBrace);
  if (closeBrace === -1) throw new Error('Could not find root closing brace');

  const content = trimmed.slice(openBrace + 1, closeBrace);
  const root = parsePhpArrayContent(content);
  if (!root || typeof root !== 'object') {
    throw new Error('Failed to parse root array');
  }

  const vehAvailRSCore = root.VehAvailRSCore || root['VehAvailRSCore'];
  const vehVendorAvails = root.VehVendorAvails || root['VehVendorAvails'];

  if (!vehAvailRSCore || typeof vehAvailRSCore !== 'object') {
    throw new Error('VehAvailRSCore not found or not an object');
  }
  if (!vehVendorAvails || typeof vehVendorAvails !== 'object') {
    throw new Error('VehVendorAvails not found or not an object');
  }

  return {
    "@attributes": root["@attributes"],
    Success: root.Success,
    VehAvailRSCore: {
      ...vehAvailRSCore,
      VehVendorAvails: vehVendorAvails,
    },
  };
}

/**
 * Parse PHP var_dump text into a generic JS object.
 * Useful for non-OTA trees (e.g. GLORIA_availabilityrs with VehAvairsdetails/availcars).
 */
export function convertPhpVarDumpToObject(phpText: string): any {
  if (!phpText || typeof phpText !== "string") {
    throw new Error("Invalid input: expected string");
  }
  const trimmed = phpText.trim().replace(/^\uFEFF/, "");
  const firstArray = findPhpRootArrayStart(trimmed);
  if (firstArray === -1) throw new Error("Could not find root array");
  const openBrace = trimmed.indexOf("{", firstArray);
  if (openBrace === -1) throw new Error("Could not find root opening brace");
  const closeBrace = findMatchingBrace(trimmed, openBrace);
  if (closeBrace === -1) throw new Error("Could not find root closing brace");

  const content = trimmed.slice(openBrace + 1, closeBrace);
  const root = parsePhpArrayContent(content);
  if (!root || typeof root !== "object") {
    throw new Error("Failed to parse root array");
  }
  return root;
}
