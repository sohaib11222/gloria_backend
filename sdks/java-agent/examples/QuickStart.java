import com.carhire.sdk.CarHireClient;
import com.carhire.sdk.Config;
import com.carhire.sdk.transport.RestTransport;

import java.util.*;

/**
 * Quick Start Example
 * 
 * This is a minimal example showing how to use the Car-Hire SDK.
 */
public class QuickStart {
    public static void main(String[] args) {
        // 1. Create configuration
        Map<String, Object> configData = new HashMap<>();
        configData.put("baseUrl", System.getenv().getOrDefault("BASE_URL", "http://localhost:8080"));
        configData.put("token", "Bearer " + System.getenv().getOrDefault("JWT_TOKEN", ""));
        
        Config config = Config.forRest(configData);
        
        // 2. Create client
        RestTransport transport = new RestTransport(config);
        CarHireClient client = new CarHireClient(transport, config);
        
        // 3. Create availability criteria
        Map<String, Object> criteria = new HashMap<>();
        criteria.put("pickup_unlocode", "PKKHI");
        criteria.put("dropoff_unlocode", "PKLHE");
        criteria.put("pickup_iso", "2025-12-01T10:00:00Z");
        criteria.put("dropoff_iso", "2025-12-03T10:00:00Z");
        criteria.put("driver_age", 28);
        criteria.put("currency", "USD");
        criteria.put("agreement_refs", Arrays.asList("AGR-001"));
        
        // 4. Search availability (streaming)
        System.out.println("Searching availability...");
        // ... (search code)
        
        System.out.println("Done!");
    }
}

