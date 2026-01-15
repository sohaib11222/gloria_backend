#!/usr/bin/env python3
"""
Test script for availability search

Usage:
    1. Copy .env.example to .env and fill in your credentials
    2. Run: python examples/test-availability.py

Or set environment variables:
    BASE_URL=http://localhost:8080 JWT_TOKEN=your_token python examples/test-availability.py
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
    # dotenv not installed, use environment variables directly
    pass

from carhire import CarHireClient, Config, AvailabilityCriteria

# Get configuration from environment variables
base_url = os.getenv('BASE_URL', 'http://localhost:8080')
token = os.getenv('JWT_TOKEN', '')
agent_id = os.getenv('AGENT_ID', '')

if not token:
    print('Error: JWT_TOKEN environment variable is required')
    print('Please set JWT_TOKEN or create a .env file with your credentials')
    sys.exit(1)

# Create configuration
config = Config.for_rest({
    'baseUrl': base_url,
    'token': f'Bearer {token}',
    'agentId': agent_id or None,
})

# Create client
client = CarHireClient(config)

# Test data from environment variables
pickup_locode = os.getenv('PICKUP_LOCODE', 'PKKHI')
return_locode = os.getenv('RETURN_LOCODE', 'PKLHE')
pickup_date = os.getenv('PICKUP_DATE', '2025-12-01T10:00:00Z')
return_date = os.getenv('RETURN_DATE', '2025-12-03T10:00:00Z')
driver_age = int(os.getenv('DRIVER_AGE', '28'))
currency = os.getenv('CURRENCY', 'USD')
agreement_ref = os.getenv('AGREEMENT_REF', 'AGR-001')


async def test_availability():
    try:
        print('=== Testing Availability Search ===')
        print(f'Base URL: {base_url}')
        print(f'Pickup: {pickup_locode} at {pickup_date}')
        print(f'Return: {return_locode} at {return_date}')
        print(f'Driver Age: {driver_age}, Currency: {currency}')
        print(f'Agreement: {agreement_ref}')
        print()

        # Create availability criteria
        criteria = AvailabilityCriteria.make(
            pickup_locode,
            return_locode,
            datetime.fromisoformat(pickup_date.replace('Z', '+00:00')),
            datetime.fromisoformat(return_date.replace('Z', '+00:00')),
            driver_age,
            currency,
            [agreement_ref],
        )

        print('Searching availability...')
        print()

        # Search availability (streaming)
        chunk_count = 0
        total_offers = 0

        async for chunk in client.availability().search(criteria):
            chunk_count += 1
            status = chunk.get('status', 'PARTIAL')
            items = chunk.get('items', [])
            total_offers += len(items)

            print(f'[Chunk {chunk_count}] Status: {status}, Offers: {len(items)}')

            if items:
                # Show first offer as example
                first_offer = items[0]
                vehicle_class = first_offer.get('vehicle_class', 'N/A')
                make_model = first_offer.get('make_model', 'N/A')
                price = first_offer.get('total_price', 'N/A')
                offer_currency = first_offer.get('currency', currency)
                source_id = first_offer.get('source_id', 'N/A')
                print(f'  Example offer: {vehicle_class} - {make_model}')
                print(f'    Price: {offer_currency} {price}')
                print(f'    Source: {source_id}')

            if status == 'COMPLETE':
                print()
                print(f'✓ Search complete! Total chunks: {chunk_count}, Total offers: {total_offers}')
                break

        if chunk_count == 0:
            print('⚠ No availability chunks received')

    except Exception as error:
        print(f'❌ Error: {error}')
        if hasattr(error, 'status_code'):
            print(f'   Status Code: {error.status_code}')
        if hasattr(error, 'code'):
            print(f'   Error Code: {error.code}')
        sys.exit(1)


if __name__ == '__main__':
    import asyncio
    asyncio.run(test_availability())

