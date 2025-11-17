import { prisma } from "../data/prisma.js";

/**
 * Generate a company code in format CMP00023
 * Uses the company's internal ID to create a unique code
 */
export async function generateCompanyCode(companyId: string): Promise<string> {
  // Extract numeric part from cuid (last portion)
  // For a more predictable format, we'll use a sequence or hash
  // For now, we'll use a simple approach: get the last 5 digits from the ID
  const numericPart = companyId.slice(-5).replace(/[^0-9]/g, '');
  
  // If we don't have enough digits, pad with zeros and use a hash
  let code: string;
  if (numericPart.length >= 3) {
    code = `CMP${numericPart.padStart(5, '0')}`;
  } else {
    // Fallback: use a hash of the ID
    const hash = companyId.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    const positiveHash = Math.abs(hash);
    code = `CMP${String(positiveHash % 100000).padStart(5, '0')}`;
  }

  // Ensure uniqueness by checking if code exists
  const existing = await prisma.company.findUnique({
    where: { companyCode: code },
    select: { id: true }
  });

  if (existing && existing.id !== companyId) {
    // If collision, append a suffix
    const suffix = Math.floor(Math.random() * 1000);
    code = `CMP${String(parseInt(code.slice(3)) + suffix).padStart(5, '0')}`;
  }

  return code;
}

