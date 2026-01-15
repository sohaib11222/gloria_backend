import com.carhire.sdk.CarHireClient;
import com.carhire.sdk.Config;
import com.carhire.sdk.transport.RestTransport;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Test script for availability search
 * 
 * Usage:
 *   1. Copy .env.example to .env and fill in your credentials
 *   2. Compile: javac -cp ".:../target/classes" examples/TestAvailability.java
 *   3. Run: java -cp ".:../target/classes" examples.TestAvailability
 */
public class TestAvailability {
    public static void main(String[] args) {
        // Get configuration from environment variables
        String baseUrl = System.getenv("BASE_URL");
        if (baseUrl == null || baseUrl.isEmpty()) {
            baseUrl = "http://localhost:8080";
        }
        
        String token = System.getenv("JWT_TOKEN");
        if (token == null || token.isEmpty()) {
            System.err.println("Error: JWT_TOKEN environment variable is required");
            System.exit(1);
        }
        
        String agentId = System.getenv("AGENT_ID");
        
        // Create configuration
        Map<String, Object> configData = new HashMap<>();
        configData.put("baseUrl", baseUrl);
        configData.put("token", "Bearer " + token);
        if (agentId != null && !agentId.isEmpty()) {
            configData.put("agentId", agentId);
        }
        
        Config config = Config.forRest(configData);
        
        // Create transport and client
        RestTransport transport = new RestTransport(config);
        CarHireClient client = new CarHireClient(transport, config);
        
        // Test data from environment variables
        String pickupLocode = System.getenv("PICKUP_LOCODE");
        if (pickupLocode == null || pickupLocode.isEmpty()) {
            pickupLocode = "PKKHI";
        }
        
        String returnLocode = System.getenv("RETURN_LOCODE");
        if (returnLocode == null || returnLocode.isEmpty()) {
            returnLocode = "PKLHE";
        }
        
        String pickupDateStr = System.getenv("PICKUP_DATE");
        if (pickupDateStr == null || pickupDateStr.isEmpty()) {
            pickupDateStr = "2025-12-01T10:00:00Z";
        }
        
        String returnDateStr = System.getenv("RETURN_DATE");
        if (returnDateStr == null || returnDateStr.isEmpty()) {
            returnDateStr = "2025-12-03T10:00:00Z";
        }
        
        String driverAgeStr = System.getenv("DRIVER_AGE");
        int driverAge = 28;
        if (driverAgeStr != null && !driverAgeStr.isEmpty()) {
            driverAge = Integer.parseInt(driverAgeStr);
        }
        
        String currency = System.getenv("CURRENCY");
        if (currency == null || currency.isEmpty()) {
            currency = "USD";
        }
        
        String agreementRef = System.getenv("AGREEMENT_REF");
        if (agreementRef == null || agreementRef.isEmpty()) {
            agreementRef = "AGR-001";
        }
        
        System.out.println("=== Testing Availability Search ===");
        System.out.println("Base URL: " + baseUrl);
        System.out.println("Pickup: " + pickupLocode + " at " + pickupDateStr);
        System.out.println("Return: " + returnLocode + " at " + returnDateStr);
        System.out.println("Driver Age: " + driverAge + ", Currency: " + currency);
        System.out.println("Agreement: " + agreementRef);
        System.out.println();
        
        // Create availability criteria
        Map<String, Object> criteria = new HashMap<>();
        criteria.put("pickup_unlocode", pickupLocode);
        criteria.put("dropoff_unlocode", returnLocode);
        criteria.put("pickup_iso", pickupDateStr);
        criteria.put("dropoff_iso", returnDateStr);
        criteria.put("driver_age", driverAge);
        criteria.put("currency", currency);
        criteria.put("agreement_refs", Arrays.asList(agreementRef));
        
        System.out.println("Searching availability...");
        System.out.println();
        
        try {
            // Search availability (streaming)
            int chunkCount = 0;
            int totalOffers = 0;
            
            Stream<CompletableFuture<Map<String, Object>>> stream = 
                client.getAvailability().search(criteria);
            
            for (CompletableFuture<Map<String, Object>> future : stream.toArray(CompletableFuture[]::new)) {
                Map<String, Object> chunk = future.get();
                chunkCount++;
                
                String status = (String) chunk.getOrDefault("status", "PARTIAL");
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> items = (List<Map<String, Object>>) chunk.getOrDefault("items", Collections.emptyList());
                totalOffers += items.size();
                
                System.out.println("[Chunk " + chunkCount + "] Status: " + status + ", Offers: " + items.size());
                
                if (!items.isEmpty()) {
                    Map<String, Object> firstOffer = items.get(0);
                    String vehicleClass = (String) firstOffer.getOrDefault("vehicle_class", "N/A");
                    String makeModel = (String) firstOffer.getOrDefault("make_model", "N/A");
                    Object price = firstOffer.getOrDefault("total_price", "N/A");
                    String offerCurrency = (String) firstOffer.getOrDefault("currency", currency);
                    String sourceId = (String) firstOffer.getOrDefault("source_id", "N/A");
                    
                    System.out.println("  Example offer: " + vehicleClass + " - " + makeModel);
                    System.out.println("    Price: " + offerCurrency + " " + price);
                    System.out.println("    Source: " + sourceId);
                }
                
                if ("COMPLETE".equals(status)) {
                    System.out.println();
                    System.out.println("✓ Search complete! Total chunks: " + chunkCount + ", Total offers: " + totalOffers);
                    break;
                }
            }
            
            if (chunkCount == 0) {
                System.out.println("⚠ No availability chunks received");
            }
            
        } catch (Exception e) {
            System.err.println("❌ Error: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }
}

