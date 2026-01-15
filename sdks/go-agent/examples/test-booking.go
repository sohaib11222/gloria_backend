package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
	"github.com/carhire/sdk"
)

func main() {
	// Load environment variables
	_ = godotenv.Load()

	baseURL := getEnv("BASE_URL", "http://localhost:8080")
	token := getEnv("JWT_TOKEN", "")
	agentID := getEnv("AGENT_ID", "")

	if token == "" {
		log.Fatal("Error: JWT_TOKEN environment variable is required")
	}

	config := sdk.ConfigForRest(map[string]interface{}{
		"baseUrl": baseURL,
		"token":   fmt.Sprintf("Bearer %s", token),
		"agentId": agentID,
	})

	client := sdk.NewCarHireClient(config)

	ctx := context.Background()

	fmt.Println("=== Testing Booking Operations ===")
	fmt.Println()

	// Step 1: Search for availability first
	fmt.Println("Step 1: Searching for availability...")
	pickupLocode := getEnv("PICKUP_LOCODE", "PKKHI")
	returnLocode := getEnv("RETURN_LOCODE", "PKLHE")
	pickupDateStr := getEnv("PICKUP_DATE", "2025-12-01T10:00:00Z")
	returnDateStr := getEnv("RETURN_DATE", "2025-12-03T10:00:00Z")
	driverAgeStr := getEnv("DRIVER_AGE", "28")
	currency := getEnv("CURRENCY", "USD")
	agreementRef := getEnv("AGREEMENT_REF", "AGR-001")

	driverAge, _ := strconv.Atoi(driverAgeStr)
	pickupAt, _ := time.Parse(time.RFC3339, pickupDateStr)
	returnAt, _ := time.Parse(time.RFC3339, returnDateStr)

	criteria, err := sdk.MakeAvailabilityCriteria(
		pickupLocode,
		returnLocode,
		pickupAt,
		returnAt,
		driverAge,
		currency,
		[]string{agreementRef},
	)
	if err != nil {
		log.Fatalf("Failed to create criteria: %v", err)
	}

	resultChan, err := client.Availability().Search(ctx, criteria)
	if err != nil {
		log.Fatalf("Failed to start search: %v", err)
	}

	var selectedOffer *sdk.AvailabilityOffer
	for chunk := range resultChan {
		if len(chunk.Items) > 0 {
			selectedOffer = &chunk.Items[0]
			fmt.Printf("✓ Found offer: %s - %s\n", selectedOffer.VehicleClass, selectedOffer.MakeModel)
			fmt.Printf("  Price: %s %.2f\n", selectedOffer.Currency, selectedOffer.TotalPrice)
			break
		}
		if chunk.Status == "COMPLETE" {
			break
		}
	}

	if selectedOffer == nil {
		fmt.Println("⚠ No offers found. Cannot test booking creation.")
		return
	}

	fmt.Println()

	// Step 2: Create booking
	fmt.Println("Step 2: Creating booking...")
	bookingData := sdk.BookingCreateFromOffer(selectedOffer, map[string]interface{}{
		"agreement_ref": agreementRef,
		"driver": map[string]interface{}{
			"firstName": "John",
			"lastName":  "Doe",
			"email":     "john.doe@example.com",
			"phone":     "+1234567890",
			"age":       driverAge,
		},
		"agent_booking_ref": fmt.Sprintf("TEST-%d", time.Now().UnixMilli()),
	})

	booking, err := client.Booking().Create(ctx, bookingData)
	if err != nil {
		log.Fatalf("Failed to create booking: %v", err)
	}

	bookingRef := booking.SupplierBookingRef
	if bookingRef == "" {
		bookingRef = "N/A"
	}
	status := booking.Status
	if status == "" {
		status = "N/A"
	}
	fmt.Printf("✓ Booking created: %s\n", bookingRef)
	fmt.Printf("  Status: %s\n", status)
	fmt.Println()

	// Step 3: Check booking status
	if booking.SupplierBookingRef != "" {
		fmt.Println("Step 3: Checking booking status...")
		status, err := client.Booking().Check(ctx, booking.SupplierBookingRef, agreementRef)
		if err != nil {
			log.Fatalf("Failed to check booking: %v", err)
		}
		fmt.Printf("✓ Booking status: %s\n", status.Status)
		fmt.Println()
	}

	fmt.Println("✓ All booking tests completed successfully!")
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

