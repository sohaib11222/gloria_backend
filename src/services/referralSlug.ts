/**
 * Normalizes admin/user input into a URL-safe referral slug (lowercase, hyphens).
 */
export function normalizeReferralSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
