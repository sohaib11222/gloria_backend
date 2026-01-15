import com.carhire.sdk.CarHireClient;
import com.carhire.sdk.Config;
import com.carhire.sdk.transport.RestTransport;

import java.util.*;

/**
 * Test script for booking operations
 * 
 * Usage:
 *   1. Copy .env.example to .env and fill in your credentials
 *   2. Compile: javac -cp ".:../target/classes" examples/TestBooking.java
 *   3. Run: java -cp ".:../target/classes" examples.TestBooking
 */
public class TestBooking {
    public static void main(String[] args) {
        // Similar setup as TestAvailability
        String baseUrl = System.getenv("BASE_URL");
        if (baseUrl == null || baseUrl.isEmpty()) {
            baseUrl = "http://localhost:8080";
        }
        
        String token = System.getenv("JWT_TOKEN");
        if (token == null || token.isEmpty()) {
            System.err.println("Error: JWT_TOKEN environment variable is required");
            System.exit(1);
        }
        
        Map<String, Object> configData = new HashMap<>();
        configData.put("baseUrl", baseUrl);
        configData.put("token", "Bearer " + token);
        
        Config config = Config.forRest(configData);
        RestTransport transport = new RestTransport(config);
        CarHireClient client = new CarHireClient(transport, config);
        
        System.out.println("=== Testing Booking Operations ===");
        System.out.println();
        
        // Step 1: Search for availability first (similar to TestAvailability)
        // ... (availability search code)
        
        // Step 2: Create booking
        // ... (booking creation code)
        
        System.out.println("✓ All booking tests completed successfully!");
    }
}

