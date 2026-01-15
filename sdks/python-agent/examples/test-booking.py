#!/usr/bin/env python3
"""
Test script for booking operations

Usage:
    1. Copy .env.example to .env and fill in your credentials
    2. Run: python examples/test-booking.py
"""

import os
import sys
from datetime import datetime

# Add parent directory to path to import SDK
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from carhire import CarHireClient, Config, AvailabilityCriteria, BookingCreate

# Get configuration
base_url = os.getenv('BASE_URL', 'http://localhost:8080')
token = os.getenv('JWT_TOKEN', '')
agent_id = os.getenv('AGENT_ID', '')

if not token:
    print('Error: JWT_TOKEN environment variable is required')
    sys.exit(1)

config = Config.for_rest({
    'baseUrl': base_url,
    'token': f'Bearer {token}',
    'agentId': agent_id or None,
})

client = CarHireClient(config)


async def test_booking():
    try:
        print('=== Testing Booking Operations ===')
        print()

        # Step 1: Search for availability first
        print('Step 1: Searching for availability...')
        criteria = AvailabilityCriteria.make(
            os.getenv('PICKUP_LOCODE', 'PKKHI'),
            os.getenv('RETURN_LOCODE', 'PKLHE'),
            datetime.fromisoformat(os.getenv('PICKUP_DATE', '2025-12-01T10:00:00Z').replace('Z', '+00:00')),
            datetime.fromisoformat(os.getenv('RETURN_DATE', '2025-12-03T10:00:00Z').replace('Z', '+00:00')),
            int(os.getenv('DRIVER_AGE', '28')),
            os.getenv('CURRENCY', 'USD'),
            [os.getenv('AGREEMENT_REF', 'AGR-001')],
        )

        selected_offer = None
        async for chunk in client.availability().search(criteria):
            items = chunk.get('items', [])
            if items:
                selected_offer = items[0]
                vehicle_class = selected_offer.get('vehicle_class', 'N/A')
                make_model = selected_offer.get('make_model', 'N/A')
                price = selected_offer.get('total_price', 'N/A')
                currency = selected_offer.get('currency', 'USD')
                print(f'✓ Found offer: {vehicle_class} - {make_model}')
                print(f'  Price: {currency} {price}')
                break
            if chunk.get('status') == 'COMPLETE':
                break

        if not selected_offer:
            print('⚠ No offers found. Cannot test booking creation.')
            return

        print()

        # Step 2: Create booking
        print('Step 2: Creating booking...')
        booking_data = BookingCreate.from_offer(selected_offer, {
            'agreement_ref': os.getenv('AGREEMENT_REF', 'AGR-001'),
            'driver': {
                'firstName': 'John',
                'lastName': 'Doe',
                'email': 'john.doe@example.com',
                'phone': '+1234567890',
                'age': int(os.getenv('DRIVER_AGE', '28')),
            },
            'agent_booking_ref': f'TEST-{int(datetime.now().timestamp() * 1000)}',
        })

        booking = await client.booking().create(booking_data)
        booking_ref = booking.get('supplier_booking_ref') or booking.get('id', 'N/A')
        status = booking.get('status', 'N/A')
        print(f'✓ Booking created: {booking_ref}')
        print(f'  Status: {status}')
        print()

        # Step 3: Check booking status
        if booking.get('supplier_booking_ref'):
            print('Step 3: Checking booking status...')
            booking_ref = booking['supplier_booking_ref']
            agreement_ref = os.getenv('AGREEMENT_REF', 'AGR-001')

            status = await client.booking().check(booking_ref, agreement_ref)
            print(f'✓ Booking status: {status.get("status", "N/A")}')
            print()

        print('✓ All booking tests completed successfully!')

    except Exception as error:
        print(f'❌ Error: {error}')
        if hasattr(error, 'status_code'):
            print(f'   Status Code: {error.status_code}')
        if hasattr(error, 'code'):
            print(f'   Error Code: {error.code}')
        sys.exit(1)


if __name__ == '__main__':
    import asyncio
    asyncio.run(test_booking())

