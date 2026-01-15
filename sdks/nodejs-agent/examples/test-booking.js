/**
 * Test script for booking operations
 * 
 * Usage:
 *   1. Copy .env.example to .env and fill in your credentials
 *   2. Run: node examples/test-booking.js
 */

// Load environment variables from .env file if available
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed, use environment variables directly
}

const { CarHireClient, Config, AvailabilityCriteria, BookingCreate } = require('../dist/index.js');

// Get configuration from environment variables
const baseUrl = process.env.BASE_URL || 'http://localhost:8080';
const token = process.env.JWT_TOKEN || '';
const agentId = process.env.AGENT_ID || '';

if (!token) {
  console.error('Error: JWT_TOKEN environment variable is required');
  process.exit(1);
}

const config = Config.forRest({
  baseUrl,
  token: `Bearer ${token}`,
  agentId: agentId || undefined,
});

const client = new CarHireClient(config);

async function testBooking() {
  try {
    console.log('=== Testing Booking Operations ===');
    console.log('');

    // Step 1: Search for availability first
    console.log('Step 1: Searching for availability...');
    const criteria = AvailabilityCriteria.make({
      pickupLocode: process.env.PICKUP_LOCODE || 'PKKHI',
      returnLocode: process.env.RETURN_LOCODE || 'PKLHE',
      pickupAt: new Date(process.env.PICKUP_DATE || '2025-12-01T10:00:00Z'),
      returnAt: new Date(process.env.RETURN_DATE || '2025-12-03T10:00:00Z'),
      driverAge: parseInt(process.env.DRIVER_AGE || '28', 10),
      currency: process.env.CURRENCY || 'USD',
      agreementRefs: [process.env.AGREEMENT_REF || 'AGR-001'],
    });

    let selectedOffer = null;
    for await (const chunk of client.getAvailability().search(criteria)) {
      if (chunk.items && chunk.items.length > 0) {
        selectedOffer = chunk.items[0];
        console.log(`✓ Found offer: ${selectedOffer.vehicle_class || 'N/A'} - ${selectedOffer.make_model || 'N/A'}`);
        console.log(`  Price: ${selectedOffer.currency || 'USD'} ${selectedOffer.total_price || 'N/A'}`);
        break;
      }
      if (chunk.status === 'COMPLETE') break;
    }

    if (!selectedOffer) {
      console.log('⚠ No offers found. Cannot test booking creation.');
      return;
    }

    console.log('');

    // Step 2: Create booking
    console.log('Step 2: Creating booking...');
    const bookingData = BookingCreate.fromOffer(selectedOffer, {
      agreement_ref: process.env.AGREEMENT_REF || 'AGR-001',
      driver: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '+1234567890',
        age: parseInt(process.env.DRIVER_AGE || '28', 10),
      },
      agent_booking_ref: `TEST-${Date.now()}`,
    });

    const booking = await client.getBooking().create(bookingData);
    console.log(`✓ Booking created: ${booking.supplier_booking_ref || booking.id || 'N/A'}`);
    console.log(`  Status: ${booking.status || 'N/A'}`);
    console.log('');

    // Step 3: Check booking status
    if (booking.supplier_booking_ref) {
      console.log('Step 3: Checking booking status...');
      const bookingRef = booking.supplier_booking_ref;
      const agreementRef = process.env.AGREEMENT_REF || 'AGR-001';

      const status = await client.getBooking().check(bookingRef, agreementRef);
      console.log(`✓ Booking status: ${status.status || 'N/A'}`);
      console.log('');
    }

    console.log('✓ All booking tests completed successfully!');

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

testBooking();

