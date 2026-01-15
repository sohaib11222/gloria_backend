/**
 * Quick Start Example
 * 
 * This is a minimal example showing how to use the Car-Hire SDK.
 * 
 * Usage:
 *   1. Copy .env.example to .env and fill in your credentials
 *   2. Run: node examples/quickstart.js
 */

// Load environment variables from .env file if available
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed, use environment variables directly
}

const { CarHireClient, Config, AvailabilityCriteria } = require('../dist/index.js');

async function main() {
  // 1. Create configuration
  const config = Config.forRest({
    baseUrl: process.env.BASE_URL || 'http://localhost:8080',
    token: `Bearer ${process.env.JWT_TOKEN || ''}`,
    agentId: process.env.AGENT_ID,
  });

  // 2. Create client
  const client = new CarHireClient(config);

  // 3. Create availability criteria
  const criteria = AvailabilityCriteria.make({
    pickupLocode: 'PKKHI',
    returnLocode: 'PKLHE',
    pickupAt: new Date('2025-12-01T10:00:00Z'),
    returnAt: new Date('2025-12-03T10:00:00Z'),
    driverAge: 28,
    currency: 'USD',
    agreementRefs: ['AGR-001'],
  });

  // 4. Search availability (streaming)
  console.log('Searching availability...');
  for await (const chunk of client.getAvailability().search(criteria)) {
    console.log(`Received ${chunk.items?.length || 0} offers (status: ${chunk.status || 'PARTIAL'})`);
    
    if (chunk.status === 'COMPLETE') {
      break;
    }
  }

  console.log('Done!');
}

main().catch(console.error);

