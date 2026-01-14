package sdk

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// RestTransport implements REST transport
type RestTransport struct {
	config   *Config
	client   *http.Client
	baseURL  string
}

// NewRestTransport creates a new REST transport
func NewRestTransport(config *Config) *RestTransport {
	baseURL := config.GetString("baseUrl", "")
	baseURL = strings.TrimSuffix(baseURL, "/")

	// Configure HTTP client timeout
	timeout := config.GetInt("longPollWaitMs", 10000) + 2000
	if timeout < 12000 {
		timeout = 12000
	}

	return &RestTransport{
		config:  config,
		client: &http.Client{
			Timeout: time.Duration(timeout) * time.Millisecond,
		},
		baseURL: baseURL,
	}
}

// headers builds HTTP headers for requests
func (rt *RestTransport) headers(extra map[string]string) map[string]string {
	h := map[string]string{
		"Authorization":    rt.config.GetString("token", ""),
		"Content-Type":     "application/json",
		"Accept":           "application/json",
		"X-Agent-Id":       rt.config.GetString("agentId", ""),
		"X-Correlation-Id": rt.config.GetString("correlationId", ""),
	}

	if apiKey := rt.config.GetString("apiKey", ""); apiKey != "" {
		h["X-API-Key"] = apiKey
	}

	for k, v := range extra {
		h[k] = v
	}

	return h
}

// doRequest performs an HTTP request
func (rt *RestTransport) doRequest(ctx context.Context, method, path string, body interface{}, headers map[string]string, timeout time.Duration) (map[string]interface{}, error) {
	var bodyReader io.Reader
	if body != nil {
		bodyBytes, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewBuffer(bodyBytes)
	}

	req, err := http.NewRequestWithContext(ctx, method, rt.baseURL+path, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	for k, v := range headers {
		req.Header.Set(k, v)
	}

	// Create a client with custom timeout if specified
	client := rt.client
	if timeout > 0 {
		client = &http.Client{Timeout: timeout}
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, TransportExceptionFromHttp(err, nil)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, TransportExceptionFromHttp(err, resp)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, NewTransportException(
			fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(respBody)),
			resp.StatusCode,
			resp.Status,
		)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		// If it's not JSON, return as string in a map
		return map[string]interface{}{
			"response": string(respBody),
		}, nil
	}

	return result, nil
}

// AvailabilitySubmit submits an availability request
func (rt *RestTransport) AvailabilitySubmit(ctx context.Context, criteria map[string]interface{}) (map[string]interface{}, error) {
	timeout := time.Duration(rt.config.GetInt("callTimeoutMs", 10000)+2000) * time.Millisecond
	return rt.doRequest(ctx, "POST", "/availability/submit", criteria, rt.headers(nil), timeout)
}

// AvailabilityPoll polls for availability results
func (rt *RestTransport) AvailabilityPoll(ctx context.Context, requestID string, sinceSeq int, waitMs int) (map[string]interface{}, error) {
	// Build query parameters
	params := url.Values{}
	params.Set("request_id", requestID)
	params.Set("since_seq", fmt.Sprintf("%d", sinceSeq))
	params.Set("wait_ms", fmt.Sprintf("%d", waitMs))

	// Calculate timeout
	timeoutMs := waitMs + 2000
	if configTimeout := rt.config.GetInt("callTimeoutMs", 10000) + 2000; timeoutMs < configTimeout {
		timeoutMs = configTimeout
	}
	timeout := time.Duration(timeoutMs) * time.Millisecond

	path := "/availability/poll?" + params.Encode()
	return rt.doRequest(ctx, "GET", path, nil, rt.headers(nil), timeout)
}

// IsLocationSupported checks if a location is supported.
// Note: Currently returns false as a safe default because the backend requires
// agreement ID (not ref) to check coverage, and there's no direct endpoint to
// resolve agreementRef to agreementId. Location validation is automatically
// performed during availability submit.
func (rt *RestTransport) IsLocationSupported(ctx context.Context, agreementRef, locode string) (bool, error) {
	// Backend doesn't have a direct /locations/supported endpoint
	// Return false for safety - SDK users should check locations via agreement coverage endpoint
	return false, nil
}

// BookingCreate creates a booking
func (rt *RestTransport) BookingCreate(ctx context.Context, payload map[string]interface{}, idempotencyKey string) (map[string]interface{}, error) {
	headers := rt.headers(nil)
	if idempotencyKey != "" {
		headers["Idempotency-Key"] = idempotencyKey
	}

	timeout := time.Duration(rt.config.GetInt("callTimeoutMs", 10000)+2000) * time.Millisecond
	return rt.doRequest(ctx, "POST", "/bookings", payload, headers, timeout)
}

// BookingModify modifies a booking
func (rt *RestTransport) BookingModify(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	supplierBookingRef, ok := payload["supplier_booking_ref"].(string)
	if !ok {
		return nil, fmt.Errorf("supplier_booking_ref required")
	}

	agreementRef, ok := payload["agreement_ref"].(string)
	if !ok {
		return nil, fmt.Errorf("agreement_ref required")
	}

	fields := payload["fields"]
	if fields == nil {
		fields = make(map[string]interface{})
	}

	// Build query parameters
	params := url.Values{}
	params.Set("agreement_ref", agreementRef)
	path := fmt.Sprintf("/bookings/%s?%s", supplierBookingRef, params.Encode())

	timeout := time.Duration(rt.config.GetInt("callTimeoutMs", 10000)+2000) * time.Millisecond
	return rt.doRequest(ctx, "PATCH", path, fields, rt.headers(nil), timeout)
}

// BookingCancel cancels a booking
func (rt *RestTransport) BookingCancel(ctx context.Context, payload map[string]interface{}) (map[string]interface{}, error) {
	supplierBookingRef, ok := payload["supplier_booking_ref"].(string)
	if !ok {
		return nil, fmt.Errorf("supplier_booking_ref required")
	}

	agreementRef, ok := payload["agreement_ref"].(string)
	if !ok {
		return nil, fmt.Errorf("agreement_ref required")
	}

	// Build query parameters
	params := url.Values{}
	params.Set("agreement_ref", agreementRef)
	path := fmt.Sprintf("/bookings/%s/cancel?%s", supplierBookingRef, params.Encode())

	timeout := time.Duration(rt.config.GetInt("callTimeoutMs", 10000)+2000) * time.Millisecond
	return rt.doRequest(ctx, "POST", path, nil, rt.headers(nil), timeout)
}

// BookingCheck checks a booking status
func (rt *RestTransport) BookingCheck(ctx context.Context, supplierBookingRef, agreementRef, sourceID string) (map[string]interface{}, error) {
	// Build query parameters
	params := url.Values{}
	params.Set("agreement_ref", agreementRef)
	if sourceID != "" {
		params.Set("source_id", sourceID)
	}
	path := fmt.Sprintf("/bookings/%s?%s", supplierBookingRef, params.Encode())

	timeout := time.Duration(rt.config.GetInt("callTimeoutMs", 10000)+2000) * time.Millisecond
	return rt.doRequest(ctx, "GET", path, nil, rt.headers(nil), timeout)
}

