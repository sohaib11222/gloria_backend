"""Configuration for Car-Hire SDK."""

import secrets
from typing import Optional


class Config:
    """Configuration class for Car-Hire SDK."""

    def __init__(self, grpc: bool, data: dict):
        self.grpc = grpc
        defaults = {
            "baseUrl": "",
            "token": "",
            "apiKey": "",
            "agentId": "",
            "callTimeoutMs": 10000,
            "availabilitySlaMs": 120000,
            "longPollWaitMs": 10000,
            "correlationId": f"python-sdk-{secrets.token_hex(6)}",
            "host": "",
            "caCert": "",
            "clientCert": "",
            "clientKey": "",
        }
        defaults.update(data)
        self.data = defaults

    @classmethod
    def for_grpc(cls, data: dict) -> "Config":
        """Create configuration for gRPC transport."""
        return cls(True, data)

    @classmethod
    def for_rest(cls, data: dict) -> "Config":
        """Create configuration for REST transport."""
        return cls(False, data)

    def is_grpc(self) -> bool:
        """Check if using gRPC transport."""
        return self.grpc

    def get(self, key: str, default=None):
        """Get configuration value."""
        return self.data.get(key, default)

    def with_correlation_id(self, correlation_id: str) -> "Config":
        """Create a new config with updated correlation ID."""
        new_data = self.data.copy()
        new_data["correlationId"] = correlation_id
        return Config(self.grpc, new_data)

