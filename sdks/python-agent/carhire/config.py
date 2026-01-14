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
        # Validation
        if not data.get("host") or not str(data.get("host", "")).strip():
            raise ValueError("host is required for gRPC configuration")
        if not data.get("caCert") or not str(data.get("caCert", "")).strip():
            raise ValueError("caCert is required for gRPC configuration")
        if not data.get("clientCert") or not str(data.get("clientCert", "")).strip():
            raise ValueError("clientCert is required for gRPC configuration")
        if not data.get("clientKey") or not str(data.get("clientKey", "")).strip():
            raise ValueError("clientKey is required for gRPC configuration")
        return cls(True, data)

    @classmethod
    def for_rest(cls, data: dict) -> "Config":
        """Create configuration for REST transport."""
        # Validation
        if not data.get("baseUrl") or not str(data.get("baseUrl", "")).strip():
            raise ValueError("baseUrl is required for REST configuration")
        if not data.get("token") or not str(data.get("token", "")).strip():
            raise ValueError("token is required for REST configuration")
        if "callTimeoutMs" in data and data["callTimeoutMs"] < 1000:
            raise ValueError("callTimeoutMs must be at least 1000ms")
        if "availabilitySlaMs" in data and data["availabilitySlaMs"] < 1000:
            raise ValueError("availabilitySlaMs must be at least 1000ms")
        if "longPollWaitMs" in data and data["longPollWaitMs"] < 1000:
            raise ValueError("longPollWaitMs must be at least 1000ms")
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

