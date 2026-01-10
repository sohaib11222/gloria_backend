import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();
async function main() {
    const passwordHash = await bcrypt.hash("11221122", 10);
    // Admin company + user
    const adminCompany = await prisma.company.upsert({
        where: { email: "admin@gmail.com" },
        update: {
            companyName: "Platform Admin",
            type: "AGENT",
            passwordHash: passwordHash,
            status: "ACTIVE",
            emailVerified: true,
            emailOtp: null,
            emailOtpExpires: null,
            approvalStatus: "APPROVED"
        },
        create: {
            companyName: "Platform Admin",
            type: "AGENT",
            email: "admin@gmail.com",
            passwordHash: passwordHash,
            status: "ACTIVE",
            emailVerified: true,
            emailOtp: null,
            emailOtpExpires: null,
            approvalStatus: "APPROVED"
        }
    });
    const adminUser = await prisma.user.upsert({
        where: { email: "admin@gmail.com" },
        update: {
            companyId: adminCompany.id,
            passwordHash: passwordHash,
            role: "ADMIN"
        },
        create: {
            companyId: adminCompany.id,
            email: "admin@gmail.com",
            passwordHash: passwordHash,
            role: "ADMIN"
        }
    });
    // Source company + user
    const sourceCompany = await prisma.company.upsert({
        where: { email: "source@gmail.com" },
        update: {
            companyName: "Test Source",
            type: "SOURCE",
            passwordHash: passwordHash,
            status: "ACTIVE",
            emailVerified: true,
            emailOtp: null,
            emailOtpExpires: null,
            approvalStatus: "APPROVED",
            companyCode: "CMP00004",
            adapterType: "mock",
            grpcEndpoint: "localhost:50051"
        },
        create: {
            companyName: "Test Source",
            type: "SOURCE",
            email: "source@gmail.com",
            passwordHash: passwordHash,
            status: "ACTIVE",
            emailVerified: true,
            emailOtp: null,
            emailOtpExpires: null,
            approvalStatus: "APPROVED",
            companyCode: "CMP00004",
            adapterType: "mock",
            grpcEndpoint: "localhost:50051"
        }
    });
    const sourceUser = await prisma.user.upsert({
        where: { email: "source@gmail.com" },
        update: {
            companyId: sourceCompany.id,
            passwordHash: passwordHash,
            role: "SOURCE_USER"
        },
        create: {
            companyId: sourceCompany.id,
            email: "source@gmail.com",
            passwordHash: passwordHash,
            role: "SOURCE_USER"
        }
    });
    // Agent company + user
    const agentCompany = await prisma.company.upsert({
        where: { email: "agent@gmail.com" },
        update: {
            companyName: "Test Agent",
            type: "AGENT",
            passwordHash: passwordHash,
            status: "ACTIVE",
            emailVerified: true,
            emailOtp: null,
            emailOtpExpires: null,
            approvalStatus: "APPROVED",
            companyCode: "CMP00005"
        },
        create: {
            companyName: "Test Agent",
            type: "AGENT",
            email: "agent@gmail.com",
            passwordHash: passwordHash,
            status: "ACTIVE",
            emailVerified: true,
            emailOtp: null,
            emailOtpExpires: null,
            approvalStatus: "APPROVED",
            companyCode: "CMP00005"
        }
    });
    const agentUser = await prisma.user.upsert({
        where: { email: "agent@gmail.com" },
        update: {
            companyId: agentCompany.id,
            passwordHash: passwordHash,
            role: "AGENT_USER"
        },
        create: {
            companyId: agentCompany.id,
            email: "agent@gmail.com",
            passwordHash: passwordHash,
            role: "AGENT_USER"
        }
    });
    console.log("✅ Seed complete!");
    console.log("Admin: admin@gmail.com / 11221122");
    console.log("Source: source@gmail.com / 11221122");
    console.log("Agent: agent@gmail.com / 11221122");
}
main()
    .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());
