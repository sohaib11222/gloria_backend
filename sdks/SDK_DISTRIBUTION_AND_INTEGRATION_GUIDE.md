# SDK Distribution & Integration Guide

**Complete guide for downloading, publishing, and integrating Car-Hire SDKs**

---

## Table of Contents

1. [SDK Distribution Methods](#sdk-distribution-methods)
2. [Publishing SDKs](#publishing-sdks)
3. [Downloading SDKs](#downloading-sdks)
4. [Frontend Integration](#frontend-integration)
5. [Backend Integration](#backend-integration)
6. [Configuration](#configuration)
7. [Quick Start Examples](#quick-start-examples)
8. [Troubleshooting](#troubleshooting)

---

## SDK Distribution Methods

### Method 1: Package Registries (Recommended for Production)

**Best for**: Production applications, automated deployments

#### Node.js/TypeScript SDK
```bash
# From npm (when published)
npm install @carhire/nodejs-sdk

# Or from GitHub packages
npm install @carhire/nodejs-sdk --registry=https://npm.pkg.github.com
```

#### Python SDK
```bash
# From PyPI (when published)
pip install carhire-python-sdk

# Or from local source
pip install -e ./sdks/python-agent
```

#### PHP SDK
```bash
# From Packagist (when published)
composer require carhire/php-sdk

# Or from local source
cd sdks/php-agent
composer install
```

#### Java SDK
```xml
<!-- From Maven Central (when published) -->
<dependency>
  <groupId>com.carhire</groupId>
  <artifactId>carhire-java-sdk</artifactId>
  <version>1.0.0</version>
</dependency>
```

#### Go SDK
```bash
# From Go modules (when published)
go get github.com/carhire/go-sdk

# Or from local source
go mod init your-project
go get ./sdks/go-agent
```

### Method 2: Direct Download (Current Method)

**Best for**: Development, testing, custom builds

#### Download from Backend Repository

1. **Clone or download the repository**
   ```bash
   git clone <repository-url>
   cd gloriaconnect_backend/sdks
   ```

2. **Copy SDK to your project**
   ```bash
   # For Node.js
   cp -r nodejs-agent /path/to/your/project/sdks/
   
   # For Python
   cp -r python-agent /path/to/your/project/sdks/
   ```

3. **Install dependencies**
   ```bash
   # Node.js
   cd nodejs-agent
   npm install
   npm run build
   
   # Python
   cd python-agent
   pip install -e .
   ```

### Method 3: Frontend Download Button (To Be Implemented)

**Best for**: User-friendly downloads from frontend UI

The frontend should provide download buttons for:
- Complete SDK packages (zip files)
- Proto files (for gRPC)
- Example code
- Setup guides

---

## Publishing SDKs

### Prerequisites

1. **Build SDKs**
   ```bash
   # Node.js
   cd sdks/nodejs-agent
   npm run build
   
   # Python
   cd sdks/python-agent
   python -m build
   
   # Java
   cd sdks/java-agent
   mvn clean package
   ```

2. **Version Management**
   - Update version in `package.json`, `pyproject.toml`, `pom.xml`, etc.
   - Follow semantic versioning (MAJOR.MINOR.PATCH)
   - Update CHANGELOG.md

### Publishing to Package Registries

#### Node.js SDK (npm)

```bash
cd sdks/nodejs-agent

# 1. Build
npm run build

# 2. Login to npm
npm login

# 3. Publish
npm publish --access public

# Or publish to GitHub Packages
npm publish --registry=https://npm.pkg.github.com
```

**package.json requirements:**
```json
{
  "name": "@carhire/nodejs-sdk",
  "version": "1.0.0",
  "publishConfig": {
    "registry": "https://registry.npmjs.org/",
    "access": "public"
  },
  "files": [
    "dist",
    "README.md",
    "package.json"
  ]
}
```

#### Python SDK (PyPI)

```bash
cd sdks/python-agent

# 1. Install build tools
pip install build twine

# 2. Build package
python -m build

# 3. Upload to PyPI
twine upload dist/*
```

**pyproject.toml requirements:**
```toml
[project]
name = "carhire-python-sdk"
version = "1.0.0"
description = "Car-Hire Agent SDK for Python"
requires-python = ">=3.8"
dependencies = [
    "httpx>=0.24.0",
    "grpcio>=1.50.0",
]
```

#### PHP SDK (Packagist)

1. **Push to GitHub/GitLab**
2. **Register on Packagist**: https://packagist.org
3. **Auto-update**: Packagist will auto-update on git push

**composer.json requirements:**
```json
{
  "name": "carhire/php-sdk",
  "version": "1.0.0",
  "type": "library",
  "autoload": {
    "psr-4": {
      "CarHire\\SDK\\": "src/"
    }
  }
}
```

#### Java SDK (Maven Central)

```bash
cd sdks/java-agent

# 1. Configure settings.xml with credentials
# 2. Deploy to Maven Central
mvn clean deploy
```

**pom.xml requirements:**
```xml
<groupId>com.carhire</groupId>
<artifactId>carhire-java-sdk</artifactId>
<version>1.0.0</version>
<packaging>jar</packaging>
```

#### Go SDK (Go Modules)

```bash
cd sdks/go-agent

# 1. Tag the release
git tag v1.0.0
git push origin v1.0.0

# 2. Go modules automatically work with git tags
```

**go.mod requirements:**
```go
module github.com/carhire/go-sdk

go 1.21

require (
    // dependencies
)
```

### Publishing Scripts

Create a `scripts/publish-all.sh` script:

```bash
#!/bin/bash
set -e

echo "Building all SDKs..."

# Node.js
cd nodejs-agent
npm run build
npm publish --access public
cd ..

# Python
cd python-agent
python -m build
twine upload dist/*
cd ..

# Add other SDKs...
```

---

## Downloading SDKs

### For End Users

#### Option 1: Package Manager (Recommended)

```bash
# Node.js
npm install @carhire/nodejs-sdk

# Python
pip install carhire-python-sdk

# PHP
composer require carhire/php-sdk

# Java (add to pom.xml)
# Go (add to go.mod)
```

#### Option 2: Direct Download from Frontend

**Frontend Implementation:**

```typescript
// In SdkGuide.tsx or similar component
const handleDownloadSdk = async (sdkType: string) => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(
      `${API_BASE_URL}/docs/sdk/${sdkType}/download`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
    
    if (!response.ok) throw new Error('Download failed');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sdkType}-sdk.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    toast.success('SDK downloaded!');
  } catch (error) {
    toast.error('Failed to download SDK');
  }
};
```

#### Option 3: GitHub Releases

1. Create GitHub release with SDK packages
2. Users download from releases page
3. Extract and use in their projects

### Backend API Endpoint (To Be Created)

```typescript
// src/api/routes/docs.routes.ts
router.get('/sdk/:sdkType/download', async (req, res) => {
  const { sdkType } = req.params;
  const sdkPath = path.join(__dirname, '../../sdks', `${sdkType}-agent`);
  
  // Create zip file
  const zip = new AdmZip();
  zip.addLocalFolder(sdkPath);
  
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${sdkType}-sdk.zip"`);
  res.send(zip.toBuffer());
});
```

---

## Frontend Integration

### How Frontend Should Display SDKs

#### 1. SDK Selection Page

```tsx
// In SdkGuide.tsx
const SdkGuide: React.FC = () => {
  const [activeSdk, setActiveSdk] = useState('typescript');
  
  const sdks = [
    { id: 'typescript', name: 'TypeScript', icon: '📘', status: 'ready' },
    { id: 'python', name: 'Python', icon: '🐍', status: 'ready' },
    { id: 'go', name: 'Go', icon: '🐹', status: 'ready' },
    // ...
  ];
  
  return (
    <div>
      <h1>Choose Your SDK</h1>
      {sdks.map(sdk => (
        <button
          key={sdk.id}
          onClick={() => setActiveSdk(sdk.id)}
          className={activeSdk === sdk.id ? 'active' : ''}
        >
          {sdk.icon} {sdk.name}
          {sdk.status === 'ready' && <span>✅</span>}
        </button>
      ))}
    </div>
  );
};
```

#### 2. Download Buttons

```tsx
// Download SDK button
<button onClick={() => handleDownloadSdk(activeSdk)}>
  <Download /> Download {activeSdk} SDK
</button>

// Download Proto button (for sources)
<button onClick={handleDownloadProto}>
  <Download /> Download Proto File
</button>

// Download Examples button
<button onClick={() => handleDownloadExamples(activeSdk)}>
  <Download /> Download Examples
</button>
```

#### 3. Installation Instructions

```tsx
const InstallationSection = ({ sdkType }) => {
  const installCommands = {
    typescript: `npm install @carhire/nodejs-sdk`,
    python: `pip install carhire-python-sdk`,
    php: `composer require carhire/php-sdk`,
    // ...
  };
  
  return (
    <div>
      <h2>Installation</h2>
      <CodeBlock code={installCommands[sdkType]} />
      <button onClick={() => copyToClipboard(installCommands[sdkType])}>
        Copy Command
      </button>
    </div>
  );
};
```

#### 4. Code Examples

```tsx
const CodeExamples = ({ sdkType, role }) => {
  const examples = {
    typescript: {
      agent: `import { CarHireClient, Config } from '@carhire/nodejs-sdk';
// ... agent code`,
      source: `import axios from 'axios';
// ... source code`,
    },
    // ...
  };
  
  return (
    <CodeBlock 
      code={examples[sdkType]?.[role] || 'No example available'} 
      language={sdkType}
    />
  );
};
```

### Frontend API Integration

#### Backend Endpoints Needed

```typescript
// GET /docs/sdk/:sdkType/download
// Returns: ZIP file with SDK

// GET /docs/sdk/:sdkType/info
// Returns: { version, description, installCommand, etc. }

// GET /docs/proto/:protoFile
// Returns: Proto file content

// GET /docs/sdk/:sdkType/examples
// Returns: Example code files
```

---

## Backend Integration

### Using SDKs in Backend Services

#### Node.js Backend

```typescript
// In your backend service
import { CarHireClient, Config } from '@carhire/nodejs-sdk';

const config = Config.forRest({
  baseUrl: process.env.API_BASE_URL || 'http://localhost:8080',
  token: process.env.API_TOKEN || '',
  agentId: process.env.AGENT_ID,
});

const client = new CarHireClient(config);

// Use in your routes
router.post('/search', async (req, res) => {
  const criteria = AvailabilityCriteria.make(req.body);
  const results = [];
  
  for await (const chunk of client.getAvailability().search(criteria)) {
    results.push(...chunk.items);
    if (chunk.status === 'COMPLETE') break;
  }
  
  res.json({ results });
});
```

#### Python Backend

```python
# In your backend service
from carhire import CarHireClient, Config

config = Config.for_rest(
    base_url=os.getenv('API_BASE_URL', 'http://localhost:8080'),
    token=os.getenv('API_TOKEN', ''),
    agent_id=os.getenv('AGENT_ID'),
)

client = CarHireClient(config)

# Use in your routes
@app.post('/search')
async def search(request: Request):
    criteria = request.json
    results = []
    
    async for chunk in client.get_availability().search(criteria):
        results.extend(chunk.items)
        if chunk.status == 'COMPLETE':
            break
    
    return {'results': results}
```

---

## Configuration

### Environment Variables

```bash
# .env file
API_BASE_URL=http://localhost:8080
API_TOKEN=your-jwt-token
AGENT_ID=your-agent-id
GRPC_HOST=localhost:50052
GRPC_TLS_ENABLED=false
```

### SDK Configuration

#### REST Configuration

```typescript
const config = Config.forRest({
  baseUrl: process.env.API_BASE_URL,
  token: process.env.API_TOKEN,
  apiKey: process.env.API_KEY, // Optional
  agentId: process.env.AGENT_ID, // Optional
  callTimeoutMs: 10000,
  availabilitySlaMs: 120000,
  longPollWaitMs: 10000,
});
```

#### gRPC Configuration

```typescript
const config = Config.forGrpc({
  host: process.env.GRPC_HOST || 'localhost:50052',
  token: process.env.API_TOKEN,
  // Certificates optional (defaults to insecure)
  caCert: process.env.GRPC_CA_CERT,
  clientCert: process.env.GRPC_CLIENT_CERT,
  clientKey: process.env.GRPC_CLIENT_KEY,
});
```

---

## Quick Start Examples

### Agent - Node.js

```typescript
import { CarHireClient, Config, AvailabilityCriteria } from '@carhire/nodejs-sdk';

// 1. Configure
const config = Config.forRest({
  baseUrl: 'https://api.example.com',
  token: 'your-jwt-token',
});

const client = new CarHireClient(config);

// 2. Search availability
const criteria = AvailabilityCriteria.make({
  pickupLocode: 'GBMAN',
  returnLocode: 'GBLHR',
  pickupAt: new Date('2025-12-01T10:00:00Z'),
  returnAt: new Date('2025-12-05T10:00:00Z'),
  driverAge: 28,
  currency: 'USD',
  agreementRefs: ['AGR-001'],
});

for await (const chunk of client.getAvailability().search(criteria)) {
  console.log(`Found ${chunk.items.length} offers`);
  if (chunk.status === 'COMPLETE') break;
}

// 3. Create booking
const booking = await client.getBooking().create({
  agreement_ref: 'AGR-001',
  supplier_offer_ref: 'OFFER-123',
  agent_booking_ref: 'AGENT-BKG-001',
}, 'idempotency-key-123');

console.log('Booking created:', booking.supplier_booking_ref);
```

### Source - REST API

```typescript
import axios from 'axios';

const API_BASE = 'http://localhost:8080';
let token = '';

// 1. Login
const loginRes = await axios.post(`${API_BASE}/auth/login`, {
  email: 'source@example.com',
  password: 'password123',
});
token = loginRes.data.access;

// 2. Configure endpoints
await axios.put(
  `${API_BASE}/endpoints/config`,
  {
    httpEndpoint: 'http://localhost:9090',
    grpcEndpoint: 'localhost:51061',
    adapterType: 'grpc',
  },
  { headers: { Authorization: `Bearer ${token}` } }
);

// 3. Sync locations
await axios.post(
  `${API_BASE}/coverage/source/${companyId}/sync`,
  {},
  { headers: { Authorization: `Bearer ${token}` } }
);
```

---

## Troubleshooting

### Common Issues

#### 1. SDK Not Found

**Problem**: `npm install @carhire/nodejs-sdk` fails

**Solutions**:
- Use local installation: `npm install ./sdks/nodejs-agent`
- Check if SDK is published to registry
- Verify package name is correct

#### 2. Proto File Not Found (gRPC)

**Problem**: `Proto file not found` error

**Solutions**:
- Ensure `protos/agent_ingress.proto` exists
- Copy proto file to your project
- Use absolute path in config

#### 3. Authentication Errors

**Problem**: 401 Unauthorized

**Solutions**:
- Verify token is valid and not expired
- Check token format (should be JWT, not "Bearer JWT")
- Ensure token has correct permissions

#### 4. Connection Errors

**Problem**: Cannot connect to backend

**Solutions**:
- Verify `baseUrl` or `host` is correct
- Check backend is running
- Verify network/firewall settings
- Test with `curl` or `grpcurl`

### Debug Mode

```typescript
// Enable debug logging
const config = Config.forRest({
  baseUrl: 'https://api.example.com',
  token: 'your-token',
  // Add debug flag if SDK supports it
  debug: true,
});
```

---

## Next Steps

1. **Publish SDKs to Package Registries**
   - npm for Node.js
   - PyPI for Python
   - Packagist for PHP
   - Maven Central for Java
   - Go modules for Go

2. **Create Backend Download Endpoints**
   - `/docs/sdk/:sdkType/download`
   - `/docs/sdk/:sdkType/info`
   - `/docs/sdk/:sdkType/examples`

3. **Enhance Frontend**
   - Add download buttons
   - Add installation instructions
   - Add code examples
   - Add troubleshooting section

4. **Create CI/CD Pipeline**
   - Auto-build on commit
   - Auto-publish on tag
   - Version management

---

## Summary

### For Developers (SDK Users)

1. **Install**: Use package manager or download directly
2. **Configure**: Set baseUrl, token, and other settings
3. **Use**: Import SDK and start making API calls
4. **Debug**: Check logs and error messages

### For Maintainers (SDK Publishers)

1. **Build**: Run build scripts for each SDK
2. **Test**: Verify SDKs work correctly
3. **Version**: Update version numbers
4. **Publish**: Upload to package registries
5. **Document**: Update README and examples

### For Frontend Developers

1. **Display**: Show SDK selection and download options
2. **Download**: Provide download buttons and API endpoints
3. **Examples**: Show code examples for each SDK
4. **Guide**: Provide step-by-step integration guide

---

**Last Updated**: 2025-01-XX  
**Version**: 1.0.0

