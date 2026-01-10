"""Exceptions for Car-Hire SDK."""

from typing import Optional


class TransportException(Exception):
    """Exception raised for transport errors."""

    def __init__(self, message: str, status_code: Optional[int] = None, code: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code

    @classmethod
    def from_http(cls, error: Exception) -> "TransportException":
        """Create exception from HTTP error."""
        status_code = None
        code = None
        message = str(error)

        if hasattr(error, "response"):
            response = error.response
            if hasattr(response, "status_code"):
                status_code = response.status_code
            if hasattr(response, "text"):
                try:
                    import json
                    data = json.loads(response.text)
                    message = json.dumps(data)
                except:
                    message = response.text

        if hasattr(error, "code"):
            code = str(error.code)

        return cls(message, status_code, code)

    @classmethod
    def from_grpc(cls, error: Exception) -> "TransportException":
        """Create exception from gRPC error."""
        code = None
        details = str(error)

        if hasattr(error, "code"):
            code = str(error.code())
        if hasattr(error, "details"):
            details = error.details()

        return cls(details, None, code)

