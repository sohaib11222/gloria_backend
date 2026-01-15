package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"
	"github.com/carhire/sdk"
)

func main() {
	// Load environment variables
	_ = godotenv.Load()

	// 1. Create configuration
	config := sdk.ConfigForRest(map[string]interface{}{
		"baseUrl": getEnv("BASE_URL", "http://localhost:8080"),
		"token":   fmt.Sprintf("Bearer %s", getEnv("JWT_TOKEN", "")),
		"agentId": getEnv("AGENT_ID", ""),
	})

	// 2. Create client
	client := sdk.NewCarHireClient(config)

	// 3. Create availability criteria
	pickupAt, _ := time.Parse(time.RFC3339, "2025-12-01T10:00:00Z")
	returnAt, _ := time.Parse(time.RFC3339, "2025-12-03T10:00:00Z")

	criteria, err := sdk.MakeAvailabilityCriteria(
		"PKKHI",
		"PKLHE",
		pickupAt,
		returnAt,
		28,
		"USD",
		[]string{"AGR-001"},
	)
	if err != nil {
		log.Fatal(err)
	}

	// 4. Search availability (streaming)
	fmt.Println("Searching availability...")
	ctx := context.Background()
	resultChan, err := client.Availability().Search(ctx, criteria)
	if err != nil {
		log.Fatal(err)
	}

	for chunk := range resultChan {
		items := chunk.Items
		status := chunk.Status
		fmt.Printf("Received %d offers (status: %s)\n", len(items), status)

		if status == "COMPLETE" {
			break
		}
	}

	fmt.Println("Done!")
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

