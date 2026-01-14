"""Booking client."""

from typing import Dict, Any, Optional
from ..config import Config
from ..dto import BookingCreate
from ..transport.interface import TransportInterface


class BookingClient:
    """Client for booking operations."""

    def __init__(self, transport: TransportInterface, config: Config):
        self.transport = transport
        self.config = config

    async def create(
        self, dto: BookingCreate, idempotency_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create booking."""
        payload = dto.to_dict()
        if not payload.get("agreement_ref"):
            raise ValueError("agreement_ref required")
        # Note: supplier_id is not required - backend resolves source_id from agreement_ref
        return await self.transport.booking_create(payload, idempotency_key)

    async def modify(
        self,
        supplier_booking_ref: str,
        fields: Dict[str, Any],
        agreement_ref: str,
        source_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Modify booking."""
        return await self.transport.booking_modify(
            {
                "supplier_booking_ref": supplier_booking_ref,
                "agreement_ref": agreement_ref,
                "fields": fields,
            }
        )

    async def cancel(
        self,
        supplier_booking_ref: str,
        agreement_ref: str,
        source_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Cancel booking."""
        return await self.transport.booking_cancel(
            {
                "supplier_booking_ref": supplier_booking_ref,
                "agreement_ref": agreement_ref,
            }
        )

    async def check(
        self,
        supplier_booking_ref: str,
        agreement_ref: str,
        source_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Check booking status."""
        return await self.transport.booking_check(
            supplier_booking_ref, agreement_ref, source_id
        )

