"""REST transport implementation."""

import httpx
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
        # Create a persistent httpx client for connection pooling
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(self.timeout, connect=10.0),
        )

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self._client.aclose()

    async def aclose(self):
        """Close the HTTP client (for cleanup)."""
        await self._client.aclose()

    def _close(self):
        """Close the HTTP client (sync wrapper - use aclose() in async context)."""
        # Note: This is a sync method, but httpx.AsyncClient.aclose() is async
        # In practice, users should use async context manager or call aclose() directly
        # This method is kept for backward compatibility but does nothing
        pass

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
            response = await self._client.post(
                "/availability/submit",
                json=criteria,
                headers=self._headers(),
                timeout=timeout,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
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
            response = await self._client.get(
                "/availability/poll",
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
        except httpx.HTTPError as e:
            raise TransportException.from_http(e)

    async def is_location_supported(self, agreement_ref: str, locode: str) -> bool:
        """Check if location is supported.
        
        Note: This method currently returns False as a safe default.
        The backend requires agreement ID (not ref) to check coverage.
        Location validation is automatically performed during availability submit.
        
        TODO: Backend should add GET /locations/supported?agreement_ref={ref}&locode={code}
        """
        # Backend doesn't have a direct /locations/supported endpoint
        # and requires agreement ID (not ref) for /coverage/agreement/{id}
        # Location validation is performed automatically during availability submit
        # Return False for safety - users should rely on availability submit validation
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
            response = await self._client.post(
                "/bookings",
                json=payload,
                headers=headers,
                timeout=timeout,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise TransportException.from_http(e)

    async def booking_modify(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Modify booking."""
        try:
            agreement_ref = payload.get("agreement_ref", "")
            supplier_booking_ref = payload.get("supplier_booking_ref")
            fields = payload.get("fields", {})

            timeout = (self.config.get("callTimeoutMs", 10000) / 1000) + 2
            response = await self._client.patch(
                f"/bookings/{supplier_booking_ref}",
                json=fields,
                params={"agreement_ref": agreement_ref},
                headers=self._headers(),
                timeout=timeout,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise TransportException.from_http(e)

    async def booking_cancel(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Cancel booking."""
        try:
            agreement_ref = payload.get("agreement_ref", "")
            supplier_booking_ref = payload.get("supplier_booking_ref")

            timeout = (self.config.get("callTimeoutMs", 10000) / 1000) + 2
            response = await self._client.post(
                f"/bookings/{supplier_booking_ref}/cancel",
                params={"agreement_ref": agreement_ref},
                headers=self._headers(),
                timeout=timeout,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
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
            response = await self._client.get(
                f"/bookings/{supplier_booking_ref}",
                params=params,
                headers=self._headers(),
                timeout=timeout,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise TransportException.from_http(e)

