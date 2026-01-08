"""gRPC transport implementation (stubs)."""

from typing import Dict, Any, Optional
from ..config import Config
from .interface import TransportInterface
from ..exceptions import TransportException


class GrpcTransport(TransportInterface):
    """gRPC transport for Car-Hire SDK (stubs until proto generation)."""

    def __init__(self, config: Config):
        self.config = config

    async def availability_submit(self, criteria: Dict[str, Any]) -> Dict[str, Any]:
        """Submit availability request."""
        raise TransportException("gRPC not wired yet. Generate stubs and implement.")

    async def availability_poll(
        self, request_id: str, since_seq: int, wait_ms: int
    ) -> Dict[str, Any]:
        """Poll availability results."""
        raise TransportException("gRPC not wired yet. Generate stubs and implement.")

    async def is_location_supported(self, agreement_ref: str, locode: str) -> bool:
        """Check if location is supported."""
        raise TransportException("gRPC not wired yet. Generate stubs and implement.")

    async def booking_create(
        self, payload: Dict[str, Any], idempotency_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create booking."""
        raise TransportException("gRPC not wired yet. Generate stubs and implement.")

    async def booking_modify(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Modify booking."""
        raise TransportException("gRPC not wired yet. Generate stubs and implement.")

    async def booking_cancel(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Cancel booking."""
        raise TransportException("gRPC not wired yet. Generate stubs and implement.")

    async def booking_check(
        self, supplier_booking_ref: str, agreement_ref: str, source_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Check booking status."""
        raise TransportException("gRPC not wired yet. Generate stubs and implement.")

