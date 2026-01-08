"""Locations client."""

from ..config import Config
from ..transport.interface import TransportInterface


class LocationsClient:
    """Client for location operations."""

    def __init__(self, transport: TransportInterface, config: Config):
        self.transport = transport
        self.config = config

    async def is_supported(self, agreement_ref: str, locode: str) -> bool:
        """Check if location is supported."""
        return await self.transport.is_location_supported(agreement_ref, locode)

