"""Data Transfer Objects for Car-Hire SDK."""

from datetime import datetime
from typing import Dict, List, Optional, Any


class AvailabilityCriteria:
    """Criteria for availability search."""

    def __init__(
        self,
        pickup_locode: str,
        return_locode: str,
        pickup_at: datetime,
        return_at: datetime,
        driver_age: int,
        currency: str,
        agreement_refs: List[str],
        vehicle_prefs: Optional[List[str]] = None,
        rate_prefs: Optional[List[str]] = None,
        residency_country: str = "US",
        extras: Optional[Dict[str, Any]] = None,
    ):
        self.pickup_locode = pickup_locode
        self.return_locode = return_locode
        self.pickup_at = pickup_at
        self.return_at = return_at
        self.driver_age = driver_age
        self.currency = currency
        self.agreement_refs = agreement_refs
        self.vehicle_prefs = vehicle_prefs or []
        self.rate_prefs = rate_prefs or []
        self.residency_country = residency_country
        self.extras = extras or {}

    @classmethod
    def make(
        cls,
        pickup_locode: str,
        return_locode: str,
        pickup_at: datetime,
        return_at: datetime,
        driver_age: int,
        currency: str,
        agreement_refs: List[str],
        vehicle_prefs: Optional[List[str]] = None,
        rate_prefs: Optional[List[str]] = None,
        residency_country: str = "US",
        extras: Optional[Dict[str, Any]] = None,
    ) -> "AvailabilityCriteria":
        """Create availability criteria."""
        return cls(
            pickup_locode,
            return_locode,
            pickup_at,
            return_at,
            driver_age,
            currency,
            agreement_refs,
            vehicle_prefs,
            rate_prefs,
            residency_country,
            extras,
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API request."""
        result = {
            "pickup_unlocode": self.pickup_locode,
            "dropoff_unlocode": self.return_locode,
            "pickup_iso": self.pickup_at.isoformat(),
            "dropoff_iso": self.return_at.isoformat(),
            "driver_age": self.driver_age,
            "residency_country": self.residency_country,
            "vehicle_classes": self.vehicle_prefs,
            "agreement_refs": self.agreement_refs,
            "rate_prefs": self.rate_prefs,
        }
        result.update(self.extras)
        return result


class AvailabilityChunk:
    """Chunk of availability results."""

    def __init__(
        self,
        items: List[Any],
        status: str,
        cursor: Optional[int],
        raw: Dict[str, Any],
    ):
        self.items = items
        self.status = status
        self.cursor = cursor
        self.raw = raw

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AvailabilityChunk":
        """Create from API response dictionary."""
        return cls(
            items=data.get("items", []),
            status=data.get("status", "PARTIAL"),
            cursor=int(data["cursor"]) if data.get("cursor") is not None else None,
            raw=data,
        )


class BookingCreate:
    """Booking creation data."""

    def __init__(self, data: Dict[str, Any]):
        self.data = data

    @classmethod
    def from_offer(cls, offer: Dict[str, Any]) -> "BookingCreate":
        """Create booking from offer data."""
        required = ["agreement_ref", "supplier_id"]
        for key in required:
            if not offer.get(key):
                raise ValueError(f"{key} required")
        return cls(offer)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API request."""
        return self.data

