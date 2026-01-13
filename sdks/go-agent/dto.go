package sdk

import (
	"encoding/json"
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

// MakeAvailabilityCriteria creates a new AvailabilityCriteria
func MakeAvailabilityCriteria(
	pickupLocode, returnLocode string,
	pickupAt, returnAt time.Time,
	driverAge int,
	currency string,
	agreementRefs []string,
) *AvailabilityCriteria {
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
	}
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
type BookingCreate struct {
	AgreementRef      string                 `json:"agreement_ref"`
	SupplierID        string                 `json:"supplier_id"`
	OfferID           string                 `json:"offer_id,omitempty"`
	SupplierOfferRef  string                 `json:"supplier_offer_ref,omitempty"`
	AgentBookingRef   string                 `json:"agent_booking_ref,omitempty"`
	Driver            *Driver                `json:"driver,omitempty"`
	Extras            map[string]interface{} `json:"-"`
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

	if supplierID, ok := data["supplier_id"].(string); ok {
		booking.SupplierID = supplierID
	} else {
		return nil, fmt.Errorf("supplier_id required")
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

	// Store extras
	for k, v := range data {
		switch k {
		case "agreement_ref", "supplier_id", "offer_id", "supplier_offer_ref", "agent_booking_ref", "driver":
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
		"supplier_id":   bc.SupplierID,
	}

	if bc.OfferID != "" {
		result["offer_id"] = bc.OfferID
	}
	if bc.SupplierOfferRef != "" {
		result["supplier_offer_ref"] = bc.SupplierOfferRef
	}
	if bc.AgentBookingRef != "" {
		result["agent_booking_ref"] = bc.AgentBookingRef
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

