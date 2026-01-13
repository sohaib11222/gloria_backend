package sdk

import (
	"context"
	"fmt"
)

// BookingClient provides booking management functionality
type BookingClient struct {
	transport Transport
	config    *Config
}

// NewBookingClient creates a new BookingClient
func NewBookingClient(transport Transport, config *Config) *BookingClient {
	return &BookingClient{
		transport: transport,
		config:    config,
	}
}

// Create creates a new booking
func (bc *BookingClient) Create(ctx context.Context, booking *BookingCreate, idempotencyKey string) (*BookingResult, error) {
	if booking == nil {
		return nil, fmt.Errorf("booking required")
	}

	if booking.AgreementRef == "" {
		return nil, fmt.Errorf("agreement_ref required")
	}

	if booking.SupplierID == "" {
		return nil, fmt.Errorf("supplier_id required")
	}

	payload := booking.ToMap()
	result, err := bc.transport.BookingCreate(ctx, payload, idempotencyKey)
	if err != nil {
		return nil, err
	}

	return BookingResultFromMap(result), nil
}

// Modify modifies an existing booking
func (bc *BookingClient) Modify(ctx context.Context, supplierBookingRef string, fields map[string]interface{}, agreementRef string, sourceID string) (*BookingResult, error) {
	if supplierBookingRef == "" {
		return nil, fmt.Errorf("supplier_booking_ref required")
	}

	if agreementRef == "" {
		return nil, fmt.Errorf("agreement_ref required")
	}

	if fields == nil {
		fields = make(map[string]interface{})
	}

	payload := map[string]interface{}{
		"supplier_booking_ref": supplierBookingRef,
		"agreement_ref":        agreementRef,
		"fields":               fields,
	}

	result, err := bc.transport.BookingModify(ctx, payload)
	if err != nil {
		return nil, err
	}

	return BookingResultFromMap(result), nil
}

// Cancel cancels a booking
func (bc *BookingClient) Cancel(ctx context.Context, supplierBookingRef, agreementRef, sourceID string) (*BookingResult, error) {
	if supplierBookingRef == "" {
		return nil, fmt.Errorf("supplier_booking_ref required")
	}

	if agreementRef == "" {
		return nil, fmt.Errorf("agreement_ref required")
	}

	payload := map[string]interface{}{
		"supplier_booking_ref": supplierBookingRef,
		"agreement_ref":        agreementRef,
	}

	result, err := bc.transport.BookingCancel(ctx, payload)
	if err != nil {
		return nil, err
	}

	return BookingResultFromMap(result), nil
}

// Check checks the status of a booking
func (bc *BookingClient) Check(ctx context.Context, supplierBookingRef, agreementRef, sourceID string) (*BookingResult, error) {
	if supplierBookingRef == "" {
		return nil, fmt.Errorf("supplier_booking_ref required")
	}

	if agreementRef == "" {
		return nil, fmt.Errorf("agreement_ref required")
	}

	result, err := bc.transport.BookingCheck(ctx, supplierBookingRef, agreementRef, sourceID)
	if err != nil {
		return nil, err
	}

	return BookingResultFromMap(result), nil
}

