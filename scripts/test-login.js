import http from 'http';

function testLogin() {
  console.log('🧪 Testing login endpoint...\n');
  
  const postData = JSON.stringify({
    email: 'admin@gmail.com',
    password: '11221122'
  });

  const options = {
    hostname: '127.0.0.1',
    port: 8080,
    path: '/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    },
    timeout: 10000
  };

  const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        
        console.log(`Status: ${res.statusCode} ${res.statusMessage}`);
        console.log('Response:', JSON.stringify(response, null, 2));
        
        if (res.statusCode === 200) {
          console.log('\n✅ Login successful!');
          console.log('Token:', response.access ? 'Present' : 'Missing');
          console.log('User:', response.user ? 'Present' : 'Missing');
          process.exit(0);
        } else {
          console.log('\n❌ Login failed!');
          console.log('Error:', response.error);
          console.log('Message:', response.message);
          process.exit(1);
        }
      } catch (e) {
        console.error('\n❌ Failed to parse response:', e.message);
        console.log('Raw response:', data);
        process.exit(1);
      }
    });
  });

  req.on('error', (error) => {
    console.error('\n❌ Connection failed!');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    console.log('\n💡 Make sure the backend server is running:');
    console.log('   cd gloriaconnect_backend');
    console.log('   npm run dev');
    console.log('\n💡 Also check:');
    console.log('   - Server is listening on port 8080');
    console.log('   - No firewall blocking the connection');
    console.log('   - Try accessing http://localhost:8080/health in browser');
    process.exit(1);
  });

  req.on('timeout', () => {
    console.error('\n❌ Request timeout!');
    req.destroy();
    process.exit(1);
  });

  req.write(postData);
  req.end();
}

// First test if server is reachable
console.log('🔍 Testing server connectivity...');
const healthCheck = http.get('http://127.0.0.1:8080/health', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('✅ Server is reachable!\n');
    testLogin();
  });
});

healthCheck.on('error', (error) => {
  console.error('❌ Cannot reach server:', error.message);
  console.log('\n💡 Make sure the backend server is running:');
  console.log('   cd gloriaconnect_backend');
  console.log('   npm run dev');
  process.exit(1);
});

healthCheck.setTimeout(5000, () => {
  console.error('❌ Health check timeout!');
  healthCheck.destroy();
  process.exit(1);
});

