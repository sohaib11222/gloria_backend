/**
 * Test script for availability search
 * 
 * Usage:
 *   1. Copy .env.example to .env and fill in your credentials
 *   2. Run: node examples/test-availability.js
 * 
 * Or set environment variables:
 *   BASE_URL=http://localhost:8080 JWT_TOKEN=your_token node examples/test-availability.js
 */

// Load environment variables from .env file if available
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed, use environment variables directly
}

const { CarHireClient, Config, AvailabilityCriteria } = require('../dist/index.js');

// Get configuration from environment variables
const baseUrl = process.env.BASE_URL || 'http://localhost:8080';
const token = process.env.JWT_TOKEN || '';
const agentId = process.env.AGENT_ID || '';

if (!token) {
  console.error('Error: JWT_TOKEN environment variable is required');
  console.error('Please set JWT_TOKEN or create a .env file with your credentials');
  process.exit(1);
}

// Create configuration
const config = Config.forRest({
  baseUrl,
  token: `Bearer ${token}`,
  agentId: agentId || undefined,
});

// Create client
const client = new CarHireClient(config);

// Test data from environment variables
const pickupLocode = process.env.PICKUP_LOCODE || 'PKKHI';
const returnLocode = process.env.RETURN_LOCODE || 'PKLHE';
const pickupDate = process.env.PICKUP_DATE || '2025-12-01T10:00:00Z';
const returnDate = process.env.RETURN_DATE || '2025-12-03T10:00:00Z';
const driverAge = parseInt(process.env.DRIVER_AGE || '28', 10);
const currency = process.env.CURRENCY || 'USD';
const agreementRef = process.env.AGREEMENT_REF || 'AGR-001';

async function testAvailability() {
  try {
    console.log('=== Testing Availability Search ===');
    console.log(`Base URL: ${baseUrl}`);
    console.log(`Pickup: ${pickupLocode} at ${pickupDate}`);
    console.log(`Return: ${returnLocode} at ${returnDate}`);
    console.log(`Driver Age: ${driverAge}, Currency: ${currency}`);
    console.log(`Agreement: ${agreementRef}`);
    console.log('');

    // Create availability criteria
    const criteria = AvailabilityCriteria.make({
      pickupLocode,
      returnLocode,
      pickupAt: new Date(pickupDate),
      returnAt: new Date(returnDate),
      driverAge,
      currency,
      agreementRefs: [agreementRef],
    });

    console.log('Searching availability...');
    console.log('');

    // Search availability (streaming)
    let chunkCount = 0;
    let totalOffers = 0;

    for await (const chunk of client.getAvailability().search(criteria)) {
      chunkCount++;
      const status = chunk.status || 'PARTIAL';
      const items = chunk.items || [];
      totalOffers += items.length;

      console.log(`[Chunk ${chunkCount}] Status: ${status}, Offers: ${items.length}`);

      if (items.length > 0) {
        // Show first offer as example
        const firstOffer = items[0];
        console.log(`  Example offer: ${firstOffer.vehicle_class || 'N/A'} - ${firstOffer.make_model || 'N/A'}`);
        console.log(`    Price: ${firstOffer.currency || currency} ${firstOffer.total_price || 'N/A'}`);
        console.log(`    Source: ${firstOffer.source_id || 'N/A'}`);
      }

      if (status === 'COMPLETE') {
        console.log('');
        console.log(`✓ Search complete! Total chunks: ${chunkCount}, Total offers: ${totalOffers}`);
        break;
      }
    }

    if (chunkCount === 0) {
      console.log('⚠ No availability chunks received');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.statusCode) {
      console.error(`   Status Code: ${error.statusCode}`);
    }
    if (error.code) {
      console.error(`   Error Code: ${error.code}`);
    }
    process.exit(1);
  }
}

// Run test
testAvailability();

