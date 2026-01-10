"""REST transport implementation."""

import requests
from typing import Dict, Any, Optional
from ..config import Config
from .interface import TransportInterface
from ..exceptions import TransportException


class RestTransport(TransportInterface):
    """REST transport for Car-Hire SDK."""

    def __init__(self, config: Config):
        self.config = config
        base_url = config.get("baseUrl", "")
        self.base_url = base_url.rstrip("/")
        self.timeout = max(
            int((config.get("longPollWaitMs", 10000) + 2000) / 1000),
            12,
        )

    def _headers(self, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        """Build request headers."""
        headers = {
            "Authorization": self.config.get("token", ""),
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Agent-Id": self.config.get("agentId", ""),
            "X-Correlation-Id": self.config.get("correlationId", ""),
        }

        api_key = self.config.get("apiKey")
        if api_key:
            headers["X-API-Key"] = api_key

        if extra:
            headers.update(extra)

        return headers

    async def availability_submit(self, criteria: Dict[str, Any]) -> Dict[str, Any]:
        """Submit availability request."""
        try:
            timeout = (self.config.get("callTimeoutMs", 10000) / 1000) + 2
            response = requests.post(
                f"{self.base_url}/availability/submit",
                json=criteria,
                headers=self._headers(),
                timeout=timeout,
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            raise TransportException.from_http(e)

    async def availability_poll(
        self, request_id: str, since_seq: int, wait_ms: int
    ) -> Dict[str, Any]:
        """Poll availability results."""
        try:
            timeout = max(
                (wait_ms / 1000) + 2,
                (self.config.get("callTimeoutMs", 10000) / 1000) + 2,
            )
            response = requests.get(
                f"{self.base_url}/availability/poll",
                params={
                    "request_id": request_id,
                    "since_seq": since_seq,
                    "wait_ms": wait_ms,
                },
                headers=self._headers(),
                timeout=timeout,
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            raise TransportException.from_http(e)

    async def is_location_supported(self, agreement_ref: str, locode: str) -> bool:
        """Check if location is supported."""
        # Backend doesn't have a direct /locations/supported endpoint
        # Return False for safety
        return False

    async def booking_create(
        self, payload: Dict[str, Any], idempotency_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create booking."""
        try:
            headers = self._headers()
            if idempotency_key:
                headers["Idempotency-Key"] = idempotency_key

            timeout = (self.config.get("callTimeoutMs", 10000) / 1000) + 2
            response = requests.post(
                f"{self.base_url}/bookings",
                json=payload,
                headers=headers,
                timeout=timeout,
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            raise TransportException.from_http(e)

    async def booking_modify(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Modify booking."""
        try:
            agreement_ref = payload.get("agreement_ref", "")
            supplier_booking_ref = payload.get("supplier_booking_ref")
            fields = payload.get("fields", {})

            timeout = (self.config.get("callTimeoutMs", 10000) / 1000) + 2
            response = requests.patch(
                f"{self.base_url}/bookings/{supplier_booking_ref}",
                json=fields,
                params={"agreement_ref": agreement_ref},
                headers=self._headers(),
                timeout=timeout,
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            raise TransportException.from_http(e)

    async def booking_cancel(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Cancel booking."""
        try:
            agreement_ref = payload.get("agreement_ref", "")
            supplier_booking_ref = payload.get("supplier_booking_ref")

            timeout = (self.config.get("callTimeoutMs", 10000) / 1000) + 2
            response = requests.post(
                f"{self.base_url}/bookings/{supplier_booking_ref}/cancel",
                params={"agreement_ref": agreement_ref},
                headers=self._headers(),
                timeout=timeout,
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            raise TransportException.from_http(e)

    async def booking_check(
        self, supplier_booking_ref: str, agreement_ref: str, source_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Check booking status."""
        try:
            params = {"agreement_ref": agreement_ref}
            if source_id:
                params["source_id"] = source_id

            timeout = (self.config.get("callTimeoutMs", 10000) / 1000) + 2
            response = requests.get(
                f"{self.base_url}/bookings/{supplier_booking_ref}",
                params=params,
                headers=self._headers(),
                timeout=timeout,
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            raise TransportException.from_http(e)

