/**
 * Type declaration for optional dependency "xlsx".
 * Install with: npm install xlsx
 */
declare module "xlsx" {
  export function read(data: Buffer | string, opts?: { type: string }): {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  export const utils: {
    sheet_to_json<T>(sheet: unknown, opts?: { header?: number; defval?: string; raw?: boolean }): T[][];
  };
}
