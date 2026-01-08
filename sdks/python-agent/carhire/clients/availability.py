"""Availability client."""

from typing import AsyncGenerator
from ..config import Config
from ..dto import AvailabilityCriteria, AvailabilityChunk
from ..transport.interface import TransportInterface


class AvailabilityClient:
    """Client for availability operations."""

    def __init__(self, transport: TransportInterface, config: Config):
        self.transport = transport
        self.config = config

    async def search(
        self, criteria: AvailabilityCriteria
    ) -> AsyncGenerator[AvailabilityChunk, None]:
        """Search availability with streaming results."""
        payload = criteria.to_dict()
        if not payload.get("agreement_refs"):
            raise ValueError("agreement_refs required")

        submit = await self.transport.availability_submit(payload)
        request_id = submit.get("request_id")
        if not request_id:
            return

        since = 0
        deadline = (
            __import__("time").time() * 1000
            + (self.config.get("availabilitySlaMs", 120000))
        )

        while True:
            remaining = max(0, deadline - (__import__("time").time() * 1000))
            if remaining <= 0:
                break

            wait = min(self.config.get("longPollWaitMs", 10000), int(remaining))
            res = await self.transport.availability_poll(request_id, since, wait)

            chunk = AvailabilityChunk.from_dict(res)
            since = chunk.cursor if chunk.cursor is not None else since

            yield chunk
            if chunk.status == "COMPLETE":
                break

