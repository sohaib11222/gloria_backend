import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Minimal seed: one admin company + user
  const adminCompany = await prisma.company.upsert({
    where: { email: "admin@gmail.com" },
    update: {
      companyName: "Platform Admin",
      type: "AGENT",
      passwordHash: "$2a$10$AbPrUISzSOV.qRFqEfvut.NFDHYJyBD69X00b2NXiWCrsBZZ.bs02", // bcrypt("11221122")
      status: "ACTIVE",
      emailVerified: true,
      emailOtp: null,
      emailOtpExpires: null
    },
    create: {
      companyName: "Platform Admin",
      type: "AGENT",
      email: "admin@gmail.com",
      passwordHash: "$2a$10$AbPrUISzSOV.qRFqEfvut.NFDHYJyBD69X00b2NXiWCrsBZZ.bs02", // bcrypt("11221122")
      status: "ACTIVE",
      emailVerified: true,
      emailOtp: null,
      emailOtpExpires: null
    }
  });

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@gmail.com" },
    update: {
      companyId: adminCompany.id,
      passwordHash: adminCompany.passwordHash,
      role: "ADMIN"
    },
    create: {
      companyId: adminCompany.id,
      email: "admin@gmail.com",
      passwordHash: adminCompany.passwordHash,
      role: "ADMIN"
    }
  });

  console.log("Seed complete: admin@gmail.com / 11221122");
  console.log("Admin Company ID:", adminCompany.id);
  console.log("Admin User ID:", adminUser.id);
}

main().finally(() => prisma.$disconnect());




