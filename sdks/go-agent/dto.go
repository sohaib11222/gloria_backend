package sdk

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// AvailabilityCriteria represents search criteria for availability
type AvailabilityCriteria struct {
	PickupLocode      string
	ReturnLocode      string
	PickupAt          time.Time
	ReturnAt          time.Time
	DriverAge         int
	Currency          string
	AgreementRefs     []string
	VehiclePrefs      []string
	RatePrefs         []string
	ResidencyCountry  string
	Extras            map[string]interface{}
}

// MakeAvailabilityCriteria creates a new AvailabilityCriteria with validation
func MakeAvailabilityCriteria(
	pickupLocode, returnLocode string,
	pickupAt, returnAt time.Time,
	driverAge int,
	currency string,
	agreementRefs []string,
) (*AvailabilityCriteria, error) {
	// Validation
	if pickupLocode == "" {
		return nil, fmt.Errorf("pickupLocode is required")
	}
	if returnLocode == "" {
		return nil, fmt.Errorf("returnLocode is required")
	}
	if pickupAt.IsZero() {
		return nil, fmt.Errorf("pickupAt must be a valid time")
	}
	if returnAt.IsZero() {
		return nil, fmt.Errorf("returnAt must be a valid time")
	}
	if !returnAt.After(pickupAt) {
		return nil, fmt.Errorf("returnAt must be after pickupAt")
	}
	if driverAge < 18 || driverAge > 100 {
		return nil, fmt.Errorf("driverAge must be between 18 and 100")
	}
	if currency == "" {
		return nil, fmt.Errorf("currency is required")
	}
	if agreementRefs == nil || len(agreementRefs) == 0 {
		return nil, fmt.Errorf("agreementRefs must be a non-empty array")
	}
	
	// Normalize
	pickupLocode = strings.ToUpper(strings.TrimSpace(pickupLocode))
	returnLocode = strings.ToUpper(strings.TrimSpace(returnLocode))
	currency = strings.ToUpper(strings.TrimSpace(currency))
	
	if agreementRefs == nil {
		agreementRefs = []string{}
	}
	return &AvailabilityCriteria{
		PickupLocode:     pickupLocode,
		ReturnLocode:     returnLocode,
		PickupAt:         pickupAt,
		ReturnAt:         returnAt,
		DriverAge:        driverAge,
		Currency:         currency,
		AgreementRefs:    agreementRefs,
		VehiclePrefs:     []string{},
		RatePrefs:        []string{},
		ResidencyCountry: "US",
		Extras:           make(map[string]interface{}),
	}, nil
}

// WithVehiclePrefs sets vehicle preferences
func (ac *AvailabilityCriteria) WithVehiclePrefs(prefs []string) *AvailabilityCriteria {
	ac.VehiclePrefs = prefs
	return ac
}

// WithRatePrefs sets rate preferences
func (ac *AvailabilityCriteria) WithRatePrefs(prefs []string) *AvailabilityCriteria {
	ac.RatePrefs = prefs
	return ac
}

// WithResidencyCountry sets residency country
func (ac *AvailabilityCriteria) WithResidencyCountry(country string) *AvailabilityCriteria {
	ac.ResidencyCountry = country
	return ac
}

// WithExtras adds extra fields
func (ac *AvailabilityCriteria) WithExtras(extras map[string]interface{}) *AvailabilityCriteria {
	for k, v := range extras {
		ac.Extras[k] = v
	}
	return ac
}

// ToMap converts AvailabilityCriteria to a map for API request
func (ac *AvailabilityCriteria) ToMap() map[string]interface{} {
	result := map[string]interface{}{
		"pickup_unlocode":    ac.PickupLocode,
		"dropoff_unlocode":   ac.ReturnLocode,
		"pickup_iso":         ac.PickupAt.Format(time.RFC3339),
		"dropoff_iso":        ac.ReturnAt.Format(time.RFC3339),
		"driver_age":         ac.DriverAge,
		"residency_country":  ac.ResidencyCountry,
		"vehicle_classes":    ac.VehiclePrefs,
		"agreement_refs":     ac.AgreementRefs,
		"rate_prefs":         ac.RatePrefs,
	}
	// Merge extras
	for k, v := range ac.Extras {
		result[k] = v
	}
	return result
}

// AvailabilityChunk represents a chunk of availability results
type AvailabilityChunk struct {
	Items   []interface{}          `json:"items"`
	Status  string                 `json:"status"`
	Cursor  *int                   `json:"cursor,omitempty"`
	Raw     map[string]interface{} `json:"-"`
}

// FromMap creates an AvailabilityChunk from a map
func AvailabilityChunkFromMap(data map[string]interface{}) *AvailabilityChunk {
	chunk := &AvailabilityChunk{
		Raw:    data,
		Status: "PARTIAL",
	}

	if items, ok := data["items"].([]interface{}); ok {
		chunk.Items = items
	}

	if status, ok := data["status"].(string); ok {
		chunk.Status = status
	}

	if cursor, ok := data["cursor"].(float64); ok {
		cursorInt := int(cursor)
		chunk.Cursor = &cursorInt
	}

	return chunk
}

// FromJSON creates an AvailabilityChunk from JSON bytes
func AvailabilityChunkFromJSON(data []byte) (*AvailabilityChunk, error) {
	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	return AvailabilityChunkFromMap(m), nil
}

// BookingCreate represents booking creation data
// Supports all optional fields accepted by the backend
type BookingCreate struct {
	AgreementRef      string                 `json:"agreement_ref"`
	SupplierOfferRef  string                 `json:"supplier_offer_ref,omitempty"`
	AgentBookingRef   string                 `json:"agent_booking_ref,omitempty"`
	
	// Availability context (optional - if provided, will retrieve context from availability search)
	AvailabilityRequestID string `json:"availability_request_id,omitempty"`
	
	// Location details (from availability search) - OTA: PickupLocation, DropOffLocation
	PickupUnlocode   string `json:"pickup_unlocode,omitempty"`   // PickupLocation (UN/LOCODE)
	DropoffUnlocode  string `json:"dropoff_unlocode,omitempty"`  // DropOffLocation (UN/LOCODE)
	PickupISO        string `json:"pickup_iso,omitempty"`        // PickupDateTime (ISO-8601)
	DropoffISO       string `json:"dropoff_iso,omitempty"`       // DropOffDateTime (ISO-8601)
	
	// Vehicle and driver details (from availability search/offer)
	VehicleClass     string `json:"vehicle_class,omitempty"`     // VehicleClass (OTA codes: ECMN, CDMR, etc.)
	VehicleMakeModel string `json:"vehicle_make_model,omitempty"` // VehicleMakeModel
	RatePlanCode     string `json:"rate_plan_code,omitempty"`    // RatePlanCode (BAR, MEMBER, PREPAY, etc.)
	DriverAge        int    `json:"driver_age,omitempty"`        // DriverAge
	ResidencyCountry string `json:"residency_country,omitempty"` // ResidencyCountry (ISO 3166-1 alpha-2)
	
	// Customer and payment information (JSON objects)
	CustomerInfo map[string]interface{} `json:"customer_info,omitempty"` // Customer name, contact details, etc.
	PaymentInfo  map[string]interface{} `json:"payment_info,omitempty"`  // Payment details, card info, etc.
	
	// Legacy/deprecated fields (kept for backward compatibility)
	SupplierID string  `json:"supplier_id,omitempty"` // Note: Not required - backend resolves from agreement_ref
	OfferID    string  `json:"offer_id,omitempty"`
	Driver     *Driver `json:"driver,omitempty"`
	Extras     map[string]interface{} `json:"-"`
}

// Driver represents driver information
type Driver struct {
	FirstName string `json:"first_name,omitempty"`
	LastName  string `json:"last_name,omitempty"`
	Email     string `json:"email,omitempty"`
	Phone     string `json:"phone,omitempty"`
	Age       int    `json:"age,omitempty"`
}

// FromOffer creates a BookingCreate from offer data
func BookingCreateFromOffer(data map[string]interface{}) (*BookingCreate, error) {
	booking := &BookingCreate{
		Extras: make(map[string]interface{}),
	}

	// Required fields
	if agreementRef, ok := data["agreement_ref"].(string); ok {
		booking.AgreementRef = agreementRef
	} else {
		return nil, fmt.Errorf("agreement_ref required")
	}

	// Note: supplier_id is not required - backend resolves source_id from agreement_ref
	// Optional: allow supplier_id if provided for backward compatibility
	if supplierID, ok := data["supplier_id"].(string); ok {
		booking.SupplierID = supplierID
	}

	// Optional fields
	if offerID, ok := data["offer_id"].(string); ok {
		booking.OfferID = offerID
	}
	if supplierOfferRef, ok := data["supplier_offer_ref"].(string); ok {
		booking.SupplierOfferRef = supplierOfferRef
	}
	if agentBookingRef, ok := data["agent_booking_ref"].(string); ok {
		booking.AgentBookingRef = agentBookingRef
	}

	// Driver info
	if driverData, ok := data["driver"].(map[string]interface{}); ok {
		driver := &Driver{}
		if firstName, ok := driverData["first_name"].(string); ok {
			driver.FirstName = firstName
		}
		if firstName, ok := driverData["firstName"].(string); ok {
			driver.FirstName = firstName
		}
		if lastName, ok := driverData["last_name"].(string); ok {
			driver.LastName = lastName
		}
		if lastName, ok := driverData["lastName"].(string); ok {
			driver.LastName = lastName
		}
		if email, ok := driverData["email"].(string); ok {
			driver.Email = email
		}
		if phone, ok := driverData["phone"].(string); ok {
			driver.Phone = phone
		}
		if age, ok := driverData["age"].(float64); ok {
			driver.Age = int(age)
		}
		if age, ok := driverData["age"].(int); ok {
			driver.Age = age
		}
		booking.Driver = driver
	}

	// Optional fields from backend schema
	if val, ok := data["availability_request_id"].(string); ok {
		booking.AvailabilityRequestID = val
	}
	if val, ok := data["pickup_unlocode"].(string); ok {
		booking.PickupUnlocode = val
	}
	if val, ok := data["dropoff_unlocode"].(string); ok {
		booking.DropoffUnlocode = val
	}
	if val, ok := data["pickup_iso"].(string); ok {
		booking.PickupISO = val
	}
	if val, ok := data["dropoff_iso"].(string); ok {
		booking.DropoffISO = val
	}
	if val, ok := data["vehicle_class"].(string); ok {
		booking.VehicleClass = val
	}
	if val, ok := data["vehicle_make_model"].(string); ok {
		booking.VehicleMakeModel = val
	}
	if val, ok := data["rate_plan_code"].(string); ok {
		booking.RatePlanCode = val
	}
	if val, ok := data["driver_age"].(float64); ok {
		booking.DriverAge = int(val)
	}
	if val, ok := data["driver_age"].(int); ok {
		booking.DriverAge = val
	}
	if val, ok := data["residency_country"].(string); ok {
		booking.ResidencyCountry = val
	}
	if val, ok := data["customer_info"].(map[string]interface{}); ok {
		booking.CustomerInfo = val
	}
	if val, ok := data["payment_info"].(map[string]interface{}); ok {
		booking.PaymentInfo = val
	}

	// Store extras (unknown fields)
	for k, v := range data {
		switch k {
		case "agreement_ref", "supplier_id", "offer_id", "supplier_offer_ref", "agent_booking_ref", 
		     "driver", "availability_request_id", "pickup_unlocode", "dropoff_unlocode", 
		     "pickup_iso", "dropoff_iso", "vehicle_class", "vehicle_make_model", 
		     "rate_plan_code", "driver_age", "residency_country", "customer_info", "payment_info":
			// Skip known fields
		default:
			booking.Extras[k] = v
		}
	}

	return booking, nil
}

// ToMap converts BookingCreate to a map for API request
func (bc *BookingCreate) ToMap() map[string]interface{} {
	result := map[string]interface{}{
		"agreement_ref": bc.AgreementRef,
	}
	
	// Add optional fields if provided
	if bc.SupplierOfferRef != "" {
		result["supplier_offer_ref"] = bc.SupplierOfferRef
	}
	if bc.AgentBookingRef != "" {
		result["agent_booking_ref"] = bc.AgentBookingRef
	}
	if bc.AvailabilityRequestID != "" {
		result["availability_request_id"] = bc.AvailabilityRequestID
	}
	if bc.PickupUnlocode != "" {
		result["pickup_unlocode"] = bc.PickupUnlocode
	}
	if bc.DropoffUnlocode != "" {
		result["dropoff_unlocode"] = bc.DropoffUnlocode
	}
	if bc.PickupISO != "" {
		result["pickup_iso"] = bc.PickupISO
	}
	if bc.DropoffISO != "" {
		result["dropoff_iso"] = bc.DropoffISO
	}
	if bc.VehicleClass != "" {
		result["vehicle_class"] = bc.VehicleClass
	}
	if bc.VehicleMakeModel != "" {
		result["vehicle_make_model"] = bc.VehicleMakeModel
	}
	if bc.RatePlanCode != "" {
		result["rate_plan_code"] = bc.RatePlanCode
	}
	if bc.DriverAge > 0 {
		result["driver_age"] = bc.DriverAge
	}
	if bc.ResidencyCountry != "" {
		result["residency_country"] = bc.ResidencyCountry
	}
	if bc.CustomerInfo != nil {
		result["customer_info"] = bc.CustomerInfo
	}
	if bc.PaymentInfo != nil {
		result["payment_info"] = bc.PaymentInfo
	}
	
	// Legacy/deprecated fields (kept for backward compatibility)
	// Note: supplier_id is optional - backend resolves source_id from agreement_ref
	if bc.SupplierID != "" {
		result["supplier_id"] = bc.SupplierID
	}
	if bc.OfferID != "" {
		result["offer_id"] = bc.OfferID
	}
	if bc.Driver != nil {
		driver := map[string]interface{}{}
		if bc.Driver.FirstName != "" {
			driver["first_name"] = bc.Driver.FirstName
		}
		if bc.Driver.LastName != "" {
			driver["last_name"] = bc.Driver.LastName
		}
		if bc.Driver.Email != "" {
			driver["email"] = bc.Driver.Email
		}
		if bc.Driver.Phone != "" {
			driver["phone"] = bc.Driver.Phone
		}
		if bc.Driver.Age > 0 {
			driver["age"] = bc.Driver.Age
		}
		result["driver"] = driver
	}

	// Merge extras
	for k, v := range bc.Extras {
		result[k] = v
	}

	return result
}

// BookingResult represents the result of a booking operation
type BookingResult struct {
	SupplierBookingRef string                 `json:"supplier_booking_ref"`
	Status             string                 `json:"status"`
	Raw                map[string]interface{} `json:"-"`
}

// FromMap creates a BookingResult from a map
func BookingResultFromMap(data map[string]interface{}) *BookingResult {
	result := &BookingResult{
		Raw: data,
	}

	if ref, ok := data["supplier_booking_ref"].(string); ok {
		result.SupplierBookingRef = ref
	}
	if status, ok := data["status"].(string); ok {
		result.Status = status
	}

	return result
}

// Location represents a location
type Location struct {
	Locode string                 `json:"locode"`
	Name   string                 `json:"name"`
	Raw    map[string]interface{} `json:"-"`
}

// FromMap creates a Location from a map
func LocationFromMap(data map[string]interface{}) *Location {
	loc := &Location{
		Raw: data,
	}

	if locode, ok := data["locode"].(string); ok {
		loc.Locode = locode
	}
	if name, ok := data["name"].(string); ok {
		loc.Name = name
	}

	return loc
}

