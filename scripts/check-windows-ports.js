import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function checkWindowsPortExclusions() {
  console.log('🔍 Checking Windows port exclusions...\n');
  
  try {
    // Check excluded port ranges
    const { stdout } = await execAsync('netsh int ipv4 show excludedportrange protocol=tcp');
    console.log('📋 Excluded Port Ranges:');
    console.log(stdout);
    
    // Check if our target ports are in use
    const targetPorts = [51061, 51062, 8080, 9090, 9091];
    
    console.log('\n🔍 Checking target ports:');
    for (const port of targetPorts) {
      try {
        const { stdout: netstatOut } = await execAsync(`netstat -ano | findstr :${port}`);
        if (netstatOut.trim()) {
          console.log(`⚠️  Port ${port} is in use:`);
          console.log(netstatOut);
        } else {
          console.log(`✅ Port ${port} is available`);
        }
      } catch (error) {
        console.log(`✅ Port ${port} is available`);
      }
    }
    
    console.log('\n💡 Recommendations:');
    console.log('   - If ports are excluded, use different ports in .env');
    console.log('   - If ports are in use, stop the conflicting services');
    console.log('   - Consider using ports above 50000 to avoid common exclusions');
    
  } catch (error) {
    console.error('❌ Failed to check port exclusions:', error.message);
    console.log('\n💡 Manual check:');
    console.log('   Run: netsh int ipv4 show excludedportrange protocol=tcp');
    console.log('   Run: netstat -ano | findstr :51061');
    console.log('   Run: netstat -ano | findstr :51062');
  }
}

async function suggestAlternativePorts() {
  console.log('\n🔧 Alternative Port Suggestions:');
  console.log('   SOURCE_GRPC_PORT=51071');
  console.log('   AGENT_GRPC_PORT=51072');
  console.log('   SOURCE_GRPC_ADDR=localhost:51071');
  console.log('   AGENT_GRPC_ADDR=localhost:51072');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  checkWindowsPortExclusions().then(() => {
    suggestAlternativePorts();
  });
}

export { checkWindowsPortExclusions, suggestAlternativePorts };
