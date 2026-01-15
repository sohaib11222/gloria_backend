# Frontend Integration Guide - SDK Download & Distribution

**Step-by-step guide for integrating SDK download and distribution into your frontend applications**

---

## Overview

This guide shows you exactly how to:
1. Add SDK download functionality to your frontend
2. Display SDK installation instructions
3. Provide code examples
4. Handle proto file downloads
5. Create a complete SDK documentation page

---

## Frontend Implementation

### 1. SDK Download Component

Create a reusable SDK download component:

```tsx
// src/components/SdkDownloadButton.tsx
import React, { useState } from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../lib/apiConfig';

interface SdkDownloadButtonProps {
  sdkType: 'nodejs' | 'python' | 'php' | 'java' | 'go' | 'perl';
  label?: string;
}

export const SdkDownloadButton: React.FC<SdkDownloadButtonProps> = ({ 
  sdkType, 
  label = 'Download SDK' 
}) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_BASE_URL}/docs/sdk/${sdkType}/download`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );

      if (!response.ok) {
        throw new Error('Failed to download SDK');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sdkType}-sdk.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success(`${sdkType.toUpperCase()} SDK downloaded!`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to download SDK');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        background: downloading ? '#9ca3af' : '#1e293b',
        color: 'white',
        border: 'none',
        borderRadius: '0.25rem',
        cursor: downloading ? 'not-allowed' : 'pointer',
        fontSize: '0.875rem',
        fontWeight: 500,
      }}
    >
      <Download size={16} />
      {downloading ? 'Downloading...' : label}
    </button>
  );
};
```

### 2. Installation Instructions Component

```tsx
// src/components/SdkInstallation.tsx
import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface SdkInstallationProps {
  sdkType: string;
}

const installCommands: Record<string, string> = {
  typescript: `npm install @carhire/nodejs-sdk
# or
yarn add @carhire/nodejs-sdk
# or
pnpm add @carhire/nodejs-sdk`,
  javascript: `npm install @carhire/nodejs-sdk
# or
yarn add @carhire/nodejs-sdk`,
  python: `pip install carhire-python-sdk
# or
pip3 install carhire-python-sdk`,
  php: `composer require carhire/php-sdk`,
  java: `<!-- Add to pom.xml -->
<dependency>
  <groupId>com.carhire</groupId>
  <artifactId>carhire-java-sdk</artifactId>
  <version>1.0.0</version>
</dependency>`,
  go: `go get github.com/carhire/go-sdk
# or
go mod init your-project
go get ./go-agent`,
  perl: `cpanm CarHire::SDK
# or
perl Makefile.PL
make
make install`,
};

export const SdkInstallation: React.FC<SdkInstallationProps> = ({ sdkType }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCommands[sdkType] || '');
      setCopied(true);
      toast.success('Installation command copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy');
    }
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        Installation
      </h3>
      <div style={{ 
        position: 'relative',
        backgroundColor: '#1f2937',
        color: '#f9fafb',
        padding: '1rem',
        borderRadius: '0.25rem',
      }}>
        <button
          onClick={handleCopy}
          style={{
            position: 'absolute',
            top: '0.5rem',
            right: '0.5rem',
            background: copied ? '#1e293b' : '#475569',
            border: '1px solid #64748b',
            borderRadius: '0.25rem',
            padding: '0.25rem 0.5rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            color: 'white',
            fontSize: '0.75rem',
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <pre style={{ 
          margin: 0, 
          fontSize: '0.875rem', 
          fontFamily: 'Monaco, Menlo, monospace',
          whiteSpace: 'pre-wrap',
          paddingRight: '4rem',
        }}>
          {installCommands[sdkType] || 'Installation instructions not available'}
        </pre>
      </div>
    </div>
  );
};
```

### 3. Complete SDK Guide Page

```tsx
// src/pages/SdkGuidePage.tsx
import React, { useState } from 'react';
import { SdkDownloadButton } from '../components/SdkDownloadButton';
import { SdkInstallation } from '../components/SdkInstallation';
import { CodeBlock } from '../components/CodeBlock';

const sdks = [
  { id: 'typescript', name: 'TypeScript', icon: '📘', ready: true },
  { id: 'python', name: 'Python', icon: '🐍', ready: true },
  { id: 'php', name: 'PHP', icon: '🐘', ready: true },
  { id: 'java', name: 'Java', icon: '☕', ready: true },
  { id: 'go', name: 'Go', icon: '🐹', ready: true },
  { id: 'perl', name: 'Perl', icon: '🐪', ready: true },
];

export const SdkGuidePage: React.FC = () => {
  const [activeSdk, setActiveSdk] = useState('typescript');

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '2rem' }}>
        SDK Documentation
      </h1>

      {/* SDK Selection */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        marginBottom: '2rem',
        flexWrap: 'wrap',
      }}>
        {sdks.map(sdk => (
          <button
            key={sdk.id}
            onClick={() => setActiveSdk(sdk.id)}
            style={{
              padding: '1rem 1.5rem',
              border: activeSdk === sdk.id ? '2px solid #1e293b' : '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              background: activeSdk === sdk.id ? '#f1f5f9' : 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '1rem',
            }}
          >
            <span>{sdk.icon}</span>
            <span>{sdk.name}</span>
            {sdk.ready && <span>✅</span>}
          </button>
        ))}
      </div>

      {/* SDK Content */}
      <div style={{ 
        backgroundColor: 'white', 
        border: '1px solid #e5e7eb', 
        borderRadius: '0.5rem', 
        padding: '2rem' 
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '2rem',
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>
            {sdks.find(s => s.id === activeSdk)?.name} SDK
          </h2>
          <SdkDownloadButton sdkType={activeSdk as any} />
        </div>

        {/* Installation */}
        <SdkInstallation sdkType={activeSdk} />

        {/* Quick Start */}
        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Quick Start
          </h3>
          <CodeBlock 
            code={getQuickStartCode(activeSdk)} 
            language={activeSdk}
          />
        </div>
      </div>
    </div>
  );
};

function getQuickStartCode(sdkType: string): string {
  const examples: Record<string, string> = {
    typescript: `import { CarHireClient, Config } from '@carhire/nodejs-sdk';

const config = Config.forRest({
  baseUrl: 'https://api.example.com',
  token: 'your-jwt-token',
});

const client = new CarHireClient(config);
// Use client...`,
    python: `from carhire import CarHireClient, Config

config = Config.for_rest(
    base_url='https://api.example.com',
    token='your-jwt-token',
)

client = CarHireClient(config)
# Use client...`,
    // Add more examples...
  };
  return examples[sdkType] || 'Example code not available';
}
```

---

## Backend Endpoints to Create

### 1. SDK Download Endpoint

```typescript
// src/api/routes/docs.routes.ts
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';

// Add to router
router.get('/sdk/:sdkType/download', async (req, res) => {
  try {
    const { sdkType } = req.params;
    const sdkMap: Record<string, string> = {
      nodejs: 'nodejs-agent',
      python: 'python-agent',
      php: 'php-agent',
      java: 'java-agent',
      go: 'go-agent',
      perl: 'perl-agent',
    };

    const sdkDir = sdkMap[sdkType];
    if (!sdkDir) {
      return res.status(400).json({ 
        error: 'INVALID_SDK_TYPE',
        message: `Unknown SDK type: ${sdkType}`,
        available: Object.keys(sdkMap),
      });
    }

    const sdkPath = path.join(process.cwd(), 'sdks', sdkDir);
    
    if (!fs.existsSync(sdkPath)) {
      return res.status(404).json({ 
        error: 'SDK_NOT_FOUND',
        message: `SDK directory not found: ${sdkPath}`,
      });
    }

    // Create zip file
    const zip = new AdmZip();
    zip.addLocalFolder(sdkPath, sdkDir);
    
    // Add proto files if needed
    const protoPath = path.join(process.cwd(), 'protos');
    if (fs.existsSync(protoPath)) {
      zip.addLocalFolder(protoPath, 'protos');
    }

    const zipBuffer = zip.toBuffer();
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${sdkType}-sdk.zip"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(zipBuffer);
  } catch (error: any) {
    res.status(500).json({ 
      error: 'DOWNLOAD_FAILED',
      message: 'Failed to create SDK package',
      details: error.message,
    });
  }
});
```

### 2. SDK Info Endpoint

```typescript
router.get('/sdk/:sdkType/info', async (req, res) => {
  try {
    const { sdkType } = req.params;
    const sdkMap: Record<string, string> = {
      nodejs: 'nodejs-agent',
      python: 'python-agent',
      // ...
    };

    const sdkDir = sdkMap[sdkType];
    if (!sdkDir) {
      return res.status(400).json({ error: 'Invalid SDK type' });
    }

    const sdkPath = path.join(process.cwd(), 'sdks', sdkDir);
    
    // Read package.json, pyproject.toml, etc.
    let info: any = {};
    
    if (sdkType === 'nodejs') {
      const pkgPath = path.join(sdkPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        info = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      }
    } else if (sdkType === 'python') {
      const pyprojectPath = path.join(sdkPath, 'pyproject.toml');
      if (fs.existsSync(pyprojectPath)) {
        // Parse TOML (use a TOML parser)
        // info = parseToml(fs.readFileSync(pyprojectPath, 'utf-8'));
      }
    }

    res.json({
      sdkType,
      version: info.version || '1.0.0',
      name: info.name || `${sdkType}-sdk`,
      description: info.description || '',
      installCommand: getInstallCommand(sdkType),
      ready: true,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

function getInstallCommand(sdkType: string): string {
  const commands: Record<string, string> = {
    nodejs: 'npm install @carhire/nodejs-sdk',
    python: 'pip install carhire-python-sdk',
    php: 'composer require carhire/php-sdk',
    // ...
  };
  return commands[sdkType] || '';
}
```

### 3. Proto File Download (Already Exists)

The proto download endpoint already exists at `/docs/proto/source_provider.proto`.

---

## Package Installation

### Install Required Dependencies

```bash
# Backend
cd gloriaconnect_backend
npm install adm-zip

# Frontend (if needed)
cd gloriaconnect_source
npm install adm-zip  # Only if you need to create zips in frontend
```

---

## Testing the Implementation

### 1. Test SDK Download

```bash
# Test download endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8080/docs/sdk/nodejs/download \
  --output nodejs-sdk.zip

# Verify zip contents
unzip -l nodejs-sdk.zip
```

### 2. Test Frontend Download

1. Open frontend application
2. Navigate to SDK guide page
3. Click "Download SDK" button
4. Verify zip file downloads correctly

### 3. Test Installation

```bash
# Extract downloaded SDK
unzip nodejs-sdk.zip -d ./test-sdk

# Install
cd test-sdk/nodejs-agent
npm install
npm run build

# Test import
node -e "const { CarHireClient } = require('./dist/index.js'); console.log('SDK loaded!');"
```

---

## Complete Integration Checklist

### Backend
- [ ] Add SDK download endpoint (`/docs/sdk/:sdkType/download`)
- [ ] Add SDK info endpoint (`/docs/sdk/:sdkType/info`)
- [ ] Install `adm-zip` package
- [ ] Test download endpoints
- [ ] Add error handling
- [ ] Add authentication (optional)

### Frontend
- [ ] Create `SdkDownloadButton` component
- [ ] Create `SdkInstallation` component
- [ ] Update `SdkGuide` page with download buttons
- [ ] Add installation instructions
- [ ] Add code examples
- [ ] Test download functionality
- [ ] Add error handling and loading states

### Documentation
- [ ] Update SDK README files
- [ ] Add download instructions
- [ ] Add installation examples
- [ ] Update frontend documentation

---

## Example: Complete SDK Page

```tsx
// Complete example showing all features
const SdkPage = () => {
  const [sdk, setSdk] = useState('typescript');
  const [sdkInfo, setSdkInfo] = useState<any>(null);

  useEffect(() => {
    // Load SDK info
    fetch(`${API_BASE_URL}/docs/sdk/${sdk}/info`)
      .then(res => res.json())
      .then(setSdkInfo);
  }, [sdk]);

  return (
    <div>
      {/* SDK Selector */}
      <SdkSelector value={sdk} onChange={setSdk} />

      {/* SDK Info */}
      {sdkInfo && (
        <div>
          <h1>{sdkInfo.name} v{sdkInfo.version}</h1>
          <p>{sdkInfo.description}</p>
        </div>
      )}

      {/* Download Button */}
      <SdkDownloadButton sdkType={sdk} />

      {/* Installation */}
      <SdkInstallation sdkType={sdk} />

      {/* Quick Start */}
      <CodeExamples sdkType={sdk} />

      {/* Documentation Links */}
      <DocumentationLinks sdkType={sdk} />
    </div>
  );
};
```

---

## Summary

### What You Need to Do

1. **Backend**: Add download endpoints to `docs.routes.ts`
2. **Frontend**: Add download buttons to SDK guide pages
3. **Test**: Verify downloads work correctly
4. **Publish**: Publish SDKs to package registries (optional)

### Quick Start

1. Copy the backend endpoint code to `docs.routes.ts`
2. Copy the frontend components to your components folder
3. Update your SDK guide page to use the new components
4. Test the download functionality

---

**Ready to implement?** Follow the code examples above step by step!

