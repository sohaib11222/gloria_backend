"""Transport interface for Car-Hire SDK."""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional


class TransportInterface(ABC):
    """Interface for transport implementations."""

    @abstractmethod
    async def availability_submit(self, criteria: Dict[str, Any]) -> Dict[str, Any]:
        """Submit availability request."""
        pass

    @abstractmethod
    async def availability_poll(
        self, request_id: str, since_seq: int, wait_ms: int
    ) -> Dict[str, Any]:
        """Poll availability results."""
        pass

    @abstractmethod
    async def is_location_supported(self, agreement_ref: str, locode: str) -> bool:
        """Check if location is supported."""
        pass

    @abstractmethod
    async def booking_create(
        self, payload: Dict[str, Any], idempotency_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create booking."""
        pass

    @abstractmethod
    async def booking_modify(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Modify booking."""
        pass

    @abstractmethod
    async def booking_cancel(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Cancel booking."""
        pass

    @abstractmethod
    async def booking_check(
        self, supplier_booking_ref: str, agreement_ref: str, source_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Check booking status."""
        pass

