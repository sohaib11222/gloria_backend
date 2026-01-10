import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding test data...');

  // Create test admin
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.company.upsert({
    where: { email: 'admin@test.com' },
    update: {},
    create: {
      companyName: 'Test Admin',
      type: 'AGENT', // Using AGENT type for admin
      email: 'admin@test.com',
      passwordHash: adminPassword,
      status: 'ACTIVE',
      emailVerified: true,
      approvalStatus: 'APPROVED',
      companyCode: 'CMP00001',
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: {},
    create: {
      companyId: admin.id,
      email: 'admin@test.com',
      passwordHash: adminPassword,
      role: 'ADMIN',
    },
  });

  console.log('✅ Created test admin');

  // Create test agents
  const agentPassword = await bcrypt.hash('agent123', 10);
  const agent1 = await prisma.company.upsert({
    where: { email: 'agent1@test.com' },
    update: {},
    create: {
      companyName: 'Test Agent 1',
      type: 'AGENT',
      email: 'agent1@test.com',
      passwordHash: agentPassword,
      status: 'ACTIVE',
      emailVerified: true,
      approvalStatus: 'APPROVED',
      companyCode: 'CMP00002',
    },
  });

  await prisma.user.upsert({
    where: { email: 'agent1@test.com' },
    update: {},
    create: {
      companyId: agent1.id,
      email: 'agent1@test.com',
      passwordHash: agentPassword,
      role: 'AGENT_USER',
    },
  });

  const agent2 = await prisma.company.upsert({
    where: { email: 'agent2@test.com' },
    update: {},
    create: {
      companyName: 'Test Agent 2',
      type: 'AGENT',
      email: 'agent2@test.com',
      passwordHash: agentPassword,
      status: 'ACTIVE',
      emailVerified: true,
      approvalStatus: 'APPROVED',
      companyCode: 'CMP00003',
    },
  });

  await prisma.user.upsert({
    where: { email: 'agent2@test.com' },
    update: {},
    create: {
      companyId: agent2.id,
      email: 'agent2@test.com',
      passwordHash: agentPassword,
      role: 'AGENT_USER',
    },
  });

  console.log('✅ Created test agents');

  // Create test sources
  const sourcePassword = await bcrypt.hash('source123', 10);
  const source1 = await prisma.company.upsert({
    where: { email: 'source1@test.com' },
    update: {},
    create: {
      companyName: 'Test Source 1',
      type: 'SOURCE',
      email: 'source1@test.com',
      passwordHash: sourcePassword,
      status: 'ACTIVE',
      emailVerified: true,
      approvalStatus: 'APPROVED',
      companyCode: 'CMP00004',
      adapterType: 'mock',
      grpcEndpoint: 'localhost:50051',
    },
  });

  await prisma.user.upsert({
    where: { email: 'source1@test.com' },
    update: {},
    create: {
      companyId: source1.id,
      email: 'source1@test.com',
      passwordHash: sourcePassword,
      role: 'SOURCE_USER',
    },
  });

  const source2 = await prisma.company.upsert({
    where: { email: 'source2@test.com' },
    update: {},
    create: {
      companyName: 'Test Source 2',
      type: 'SOURCE',
      email: 'source2@test.com',
      passwordHash: sourcePassword,
      status: 'ACTIVE',
      emailVerified: true,
      approvalStatus: 'APPROVED',
      companyCode: 'CMP00005',
      adapterType: 'mock',
      grpcEndpoint: 'localhost:50052',
    },
  });

  await prisma.user.upsert({
    where: { email: 'source2@test.com' },
    update: {},
    create: {
      companyId: source2.id,
      email: 'source2@test.com',
      passwordHash: sourcePassword,
      role: 'SOURCE_USER',
    },
  });

  console.log('✅ Created test sources');

  // Create test agreements
  const agreement1 = await prisma.agreement.upsert({
    where: {
      sourceId_agreementRef: {
        sourceId: source1.id,
        agreementRef: 'TEST-AGR-001',
      },
    },
    update: {},
    create: {
      agentId: agent1.id,
      sourceId: source1.id,
      agreementRef: 'TEST-AGR-001',
      status: 'ACTIVE',
      validFrom: new Date(),
      validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
    },
  });

  const agreement2 = await prisma.agreement.upsert({
    where: {
      sourceId_agreementRef: {
        sourceId: source2.id,
        agreementRef: 'TEST-AGR-002',
      },
    },
    update: {},
    create: {
      agentId: agent1.id,
      sourceId: source2.id,
      agreementRef: 'TEST-AGR-002',
      status: 'ACTIVE',
      validFrom: new Date(),
      validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  console.log('✅ Created test agreements');

  // Add some source locations
  const unlocodes = ['GBMAN', 'GBGLA', 'USNYC', 'USLAX', 'FRPAR'];
  for (const unlocode of unlocodes) {
    // Check if UNLocode exists, if not create a simple one
    await prisma.uNLocode.upsert({
      where: { unlocode },
      update: {},
      create: {
        unlocode,
        country: unlocode.substring(0, 2),
        place: unlocode.substring(2),
      },
    });

    await prisma.sourceLocation.upsert({
      where: {
        sourceId_unlocode: {
          sourceId: source1.id,
          unlocode,
        },
      },
      update: {},
      create: {
        sourceId: source1.id,
        unlocode,
      },
    });
  }

  console.log('✅ Created test locations');

  console.log('\n📊 Test Data Summary:');
  console.log('Admin: admin@test.com / admin123');
  console.log('Agent 1: agent1@test.com / agent123');
  console.log('Agent 2: agent2@test.com / agent123');
  console.log('Source 1: source1@test.com / source123');
  console.log('Source 2: source2@test.com / source123');
  console.log('Agreements: TEST-AGR-001, TEST-AGR-002');
  console.log('\n✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

