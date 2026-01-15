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
	// Load environment variables from .env file if available
	_ = godotenv.Load()

	// Get configuration from environment variables
	baseURL := getEnv("BASE_URL", "http://localhost:8080")
	token := getEnv("JWT_TOKEN", "")
	agentID := getEnv("AGENT_ID", "")

	if token == "" {
		log.Fatal("Error: JWT_TOKEN environment variable is required")
	}

	// Create configuration
	config := sdk.ConfigForRest(map[string]interface{}{
		"baseUrl": baseURL,
		"token":   fmt.Sprintf("Bearer %s", token),
		"agentId": agentID,
	})

	// Create client
	client := sdk.NewCarHireClient(config)

	// Test data from environment variables
	pickupLocode := getEnv("PICKUP_LOCODE", "PKKHI")
	returnLocode := getEnv("RETURN_LOCODE", "PKLHE")
	pickupDateStr := getEnv("PICKUP_DATE", "2025-12-01T10:00:00Z")
	returnDateStr := getEnv("RETURN_DATE", "2025-12-03T10:00:00Z")
	driverAgeStr := getEnv("DRIVER_AGE", "28")
	currency := getEnv("CURRENCY", "USD")
	agreementRef := getEnv("AGREEMENT_REF", "AGR-001")

	driverAge, err := strconv.Atoi(driverAgeStr)
	if err != nil {
		log.Fatalf("Invalid DRIVER_AGE: %v", err)
	}

	pickupAt, err := time.Parse(time.RFC3339, pickupDateStr)
	if err != nil {
		log.Fatalf("Invalid PICKUP_DATE: %v", err)
	}

	returnAt, err := time.Parse(time.RFC3339, returnDateStr)
	if err != nil {
		log.Fatalf("Invalid RETURN_DATE: %v", err)
	}

	fmt.Println("=== Testing Availability Search ===")
	fmt.Printf("Base URL: %s\n", baseURL)
	fmt.Printf("Pickup: %s at %s\n", pickupLocode, pickupDateStr)
	fmt.Printf("Return: %s at %s\n", returnLocode, returnDateStr)
	fmt.Printf("Driver Age: %d, Currency: %s\n", driverAge, currency)
	fmt.Printf("Agreement: %s\n", agreementRef)
	fmt.Println()

	// Create availability criteria
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

	fmt.Println("Searching availability...")
	fmt.Println()

	// Search availability (streaming)
	ctx := context.Background()
	resultChan, err := client.Availability().Search(ctx, criteria)
	if err != nil {
		log.Fatalf("Failed to start search: %v", err)
	}

	chunkCount := 0
	totalOffers := 0

	for chunk := range resultChan {
		chunkCount++
		status := chunk.Status
		items := chunk.Items
		totalOffers += len(items)

		fmt.Printf("[Chunk %d] Status: %s, Offers: %d\n", chunkCount, status, len(items))

		if len(items) > 0 {
			// Show first offer as example
			firstOffer := items[0]
			vehicleClass := firstOffer.VehicleClass
			if vehicleClass == "" {
				vehicleClass = "N/A"
			}
			makeModel := firstOffer.MakeModel
			if makeModel == "" {
				makeModel = "N/A"
			}
			price := firstOffer.TotalPrice
			offerCurrency := firstOffer.Currency
			if offerCurrency == "" {
				offerCurrency = currency
			}
			sourceID := firstOffer.SourceID
			if sourceID == "" {
				sourceID = "N/A"
			}
			fmt.Printf("  Example offer: %s - %s\n", vehicleClass, makeModel)
			fmt.Printf("    Price: %s %.2f\n", offerCurrency, price)
			fmt.Printf("    Source: %s\n", sourceID)
		}

		if status == "COMPLETE" {
			fmt.Println()
			fmt.Printf("✓ Search complete! Total chunks: %d, Total offers: %d\n", chunkCount, totalOffers)
			break
		}
	}

	if chunkCount == 0 {
		fmt.Println("⚠ No availability chunks received")
	}
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

