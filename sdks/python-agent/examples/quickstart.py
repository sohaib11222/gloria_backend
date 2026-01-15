#!/usr/bin/env python3
"""
Quick Start Example

This is a minimal example showing how to use the Car-Hire SDK.

Usage:
    1. Copy .env.example to .env and fill in your credentials
    2. Run: python examples/quickstart.py
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

from carhire import CarHireClient, Config, AvailabilityCriteria


async def main():
    # 1. Create configuration
    config = Config.for_rest({
        'baseUrl': os.getenv('BASE_URL', 'http://localhost:8080'),
        'token': f'Bearer {os.getenv("JWT_TOKEN", "")}',
        'agentId': os.getenv('AGENT_ID'),
    })

    # 2. Create client
    # The client uses async HTTP (httpx) for non-blocking requests
    # For proper cleanup, use async context manager or manually close the transport
    client = CarHireClient(config)

    # 3. Create availability criteria
    criteria = AvailabilityCriteria.make(
        'PKKHI',
        'PKLHE',
        datetime.fromisoformat('2025-12-01T10:00:00Z'.replace('Z', '+00:00')),
        datetime.fromisoformat('2025-12-03T10:00:00Z'.replace('Z', '+00:00')),
        28,
        'USD',
        ['AGR-001'],
    )

    # 4. Search availability (streaming)
    print('Searching availability...')
    async for chunk in client.availability().search(criteria):
        items = chunk.get('items', [])
        status = chunk.get('status', 'PARTIAL')
        print(f'Received {len(items)} offers (status: {status})')
        
        if status == 'COMPLETE':
            break

    print('Done!')


if __name__ == '__main__':
    import asyncio
    asyncio.run(main())

