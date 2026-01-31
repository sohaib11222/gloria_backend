/**
 * Parse PHP var_dump text into OTA VehAvailRS-shaped object for availability responses.
 * Used when the source endpoint (e.g. pricetest2.php) returns var_dump() instead of JSON.
 * Expects root to have VehAvailRSCore and VehVendorAvails; normalizes so VehVendorAvails
 * is inside VehAvailRSCore for isOtaVehAvailResponse().
 */

const KEY_VALUE_RE = /\["([^"]+)"\]\s*=>|\[(\d+)\]\s*=>/g;
const STRING_VALUE_RE = /\s*string\s*\(\s*(\d+)\s*\)\s*"\s*/;
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
 */
function parsePhpArrayContent(content: string): any {
  const contentTrimmed = content.trim();
  if (!contentTrimmed) return {};

  const entries: { key: string | number; start: number }[] = [];
  KEY_VALUE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = KEY_VALUE_RE.exec(content)) !== null) {
    const key = m[1] !== undefined ? m[1] : parseInt(m[2], 10);
    const valueStart = m.index + m[0].length;
    entries.push({ key, start: valueStart });
  }

  const result: any = {};
  for (let i = 0; i < entries.length; i++) {
    const { key, start } = entries[i];
    const rest = content.slice(start);

    let value: any = undefined;
    const strMatch = rest.match(STRING_VALUE_RE);
    const arrayMatch = rest.match(ARRAY_VALUE_RE);
    if (strMatch && (!arrayMatch || (strMatch.index ?? 0) <= (arrayMatch.index ?? Infinity))) {
      const parsed = parsePhpString(content, start);
      if (parsed) value = parsed.value;
    } else if (arrayMatch) {
      const parsed = parsePhpArray(content, start);
      if (parsed) value = parsed.value;
    }

    if (value !== undefined) result[key] = value;
  }

  const allNumeric = entries.length > 0 && entries.every(e => typeof e.key === 'number');
  if (allNumeric && entries.length > 0) {
    const maxIdx = Math.max(...entries.map(e => e.key as number));
    const arr: any[] = [];
    for (let j = 0; j <= maxIdx; j++) arr.push(result[j] !== undefined ? result[j] : undefined);
    return arr;
  }
  return result;
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
  const trimmed = phpText.trim();
  if (!trimmed.includes('VehAvailRSCore') || !trimmed.includes('VehVendorAvails')) {
    throw new Error('PHP var_dump must contain VehAvailRSCore and VehVendorAvails');
  }

  const firstArray = trimmed.indexOf('array(');
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
