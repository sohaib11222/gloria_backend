"""Main client for Car-Hire SDK."""

from .config import Config
from .clients.availability import AvailabilityClient
from .clients.booking import BookingClient
from .clients.locations import LocationsClient
from .transport.rest import RestTransport
from .transport.grpc import GrpcTransport
from .transport.interface import TransportInterface


class CarHireClient:
    """Main client for Car-Hire SDK."""

    def __init__(self, config: Config):
        self.config = config
        self.transport: TransportInterface = (
            GrpcTransport(config) if config.is_grpc() else RestTransport(config)
        )
        self.availability = AvailabilityClient(self.transport, self.config)
        self.booking = BookingClient(self.transport, self.config)
        self.locations = LocationsClient(self.transport, self.config)

    async def __aenter__(self):
        """Async context manager entry."""
        if hasattr(self.transport, "__aenter__"):
            await self.transport.__aenter__()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit - cleanup resources."""
        if hasattr(self.transport, "__aexit__"):
            await self.transport.__aexit__(exc_type, exc_val, exc_tb)
        elif hasattr(self.transport, "aclose"):
            await self.transport.aclose()

    async def aclose(self):
        """Manually close the client and cleanup resources."""
        if hasattr(self.transport, "aclose"):
            await self.transport.aclose()

    def get_availability(self) -> AvailabilityClient:
        """Get availability client."""
        return self.availability

    def get_booking(self) -> BookingClient:
        """Get booking client."""
        return self.booking

    def get_locations(self) -> LocationsClient:
        """Get locations client."""
        return self.locations

    def get_transport(self) -> TransportInterface:
        """Get transport instance."""
        return self.transport

