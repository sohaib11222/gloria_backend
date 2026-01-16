import "dotenv/config";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAvailabilityJob() {
  try {
    // From your logs, the jobId is: cmkhazl4c000mp22jwh6u1vv3
    const jobId = process.argv[2] || 'cmkhazl4c000mp22jwh6u1vv3';
    
    console.log(`🔍 Checking availability job: ${jobId}\n`);
    
    // 1. Get the job
    const job = await prisma.availabilityJob.findUnique({
      where: { id: jobId },
      include: {
        results: {
          orderBy: { seq: 'asc' },
          take: 50 // Get first 50 results
        }
      }
    });
    
    if (!job) {
      console.log('❌ Job not found!');
      return;
    }
    
    console.log('📋 Job Info:');
    console.log(`   - ID: ${job.id}`);
    console.log(`   - Status: ${job.status}`);
    console.log(`   - Agent ID: ${job.agentId}`);
    console.log(`   - Expected Sources: ${job.expectedSources}`);
    console.log(`   - Created: ${job.createdAt}`);
    console.log(`   - Results Count: ${job.results.length}\n`);
    
    // 2. Show criteria
    const criteria = job.criteriaJson;
    console.log('📝 Search Criteria:');
    console.log(JSON.stringify(criteria, null, 2));
    console.log('');
    
    // 3. Show results
    console.log(`📊 Results (${job.results.length} items):\n`);
    
    if (job.results.length === 0) {
      console.log('   ⚠️  NO RESULTS YET!');
      console.log('\n   Possible reasons:');
      console.log('   1. Source is still processing');
      console.log('   2. Source returned empty results');
      console.log('   3. Source timed out or errored');
      console.log('   4. You need to poll for results');
    } else {
      job.results.forEach((result, index) => {
        console.log(`   ${index + 1}. Result #${result.seq}:`);
        console.log(`      - Source ID: ${result.sourceId}`);
        console.log(`      - Created: ${result.createdAt}`);
        const offer = result.offerJson;
        
        if (offer?.error) {
          console.log(`      - ❌ Error: ${offer.error}`);
          if (offer.message) console.log(`      - Message: ${offer.message}`);
        } else if (offer?.offers && Array.isArray(offer.offers)) {
          console.log(`      - ✅ Offers: ${offer.offers.length}`);
          if (offer.offers.length > 0) {
            const firstOffer = offer.offers[0];
            console.log(`      - First offer:`, JSON.stringify(firstOffer, null, 8));
          }
        } else {
          console.log(`      - 📦 Data:`, JSON.stringify(offer, null, 8));
        }
        console.log('');
      });
    }
    
    // 4. Check source responses
    const distinctSources = new Set(job.results.map(r => r.sourceId));
    console.log(`\n🔍 Source Response Summary:`);
    console.log(`   - Expected sources: ${job.expectedSources}`);
    console.log(`   - Sources that responded: ${distinctSources.size}`);
    console.log(`   - Source IDs: ${Array.from(distinctSources).join(', ')}`);
    
    // 5. Check for errors/timeouts
    const errors = job.results.filter(r => {
      const json = r.offerJson || {};
      return json.error;
    });
    
    if (errors.length > 0) {
      console.log(`\n⚠️  Errors/Timeouts found: ${errors.length}`);
      errors.forEach(err => {
        const json = err.offerJson || {};
        console.log(`   - Source ${err.sourceId}: ${json.error}${json.message ? ` - ${json.message}` : ''}`);
      });
    }
    
    // 6. Instructions
    console.log(`\n📡 How to Poll for Results:`);
    console.log(`   GET /availability/poll?requestId=${jobId}&sinceSeq=0&waitMs=5000`);
    console.log(`\n   Or use curl:`);
    console.log(`   curl "http://localhost:8080/availability/poll?requestId=${jobId}&sinceSeq=0&waitMs=5000" \\`);
    console.log(`     -H "Authorization: Bearer <your-token>"`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAvailabilityJob();

