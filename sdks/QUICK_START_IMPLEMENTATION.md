# Quick Start Implementation Guide

**Get SDK download and distribution working in 30 minutes**

---

## Step-by-Step Implementation

### Step 1: Install Backend Dependencies (2 minutes)

```bash
cd gloriaconnect_backend
npm install adm-zip @types/adm-zip
```

### Step 2: Add SDK Routes to Backend (5 minutes)

The SDK routes file is already created at `src/api/routes/sdk.routes.ts`.

**Verify it's mounted in `src/api/app.ts`:**

```typescript
import sdkRouter from "./routes/sdk.routes.js";

// In buildApp() function, add:
app.use("/docs", sdkRouter);
```

### Step 3: Test Backend Endpoints (3 minutes)

```bash
# Start backend
npm run dev

# Test SDK info endpoint
curl http://localhost:8080/docs/sdk/nodejs/info

# Test SDK download (requires auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8080/docs/sdk/nodejs/download \
  --output test-sdk.zip

# Verify zip contents
unzip -l test-sdk.zip
```

### Step 4: Add Frontend Download Component (10 minutes)

**Create `src/components/SdkDownloadButton.tsx`:**

```tsx
import React, { useState } from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../lib/apiConfig';

interface Props {
  sdkType: 'nodejs' | 'python' | 'php' | 'java' | 'go' | 'perl';
  label?: string;
}

export const SdkDownloadButton: React.FC<Props> = ({ 
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

### Step 5: Update SDK Guide Page (5 minutes)

**In your `SdkGuide.tsx`, add download button:**

```tsx
import { SdkDownloadButton } from '../components/SdkDownloadButton';

// In your component, add:
<div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
  <h2>TypeScript SDK</h2>
  <SdkDownloadButton sdkType="nodejs" />
</div>
```

### Step 6: Test Everything (5 minutes)

1. **Start backend**: `npm run dev` (in gloriaconnect_backend)
2. **Start frontend**: `npm run dev` (in gloriaconnect_source or gloriaconnect_agent)
3. **Navigate to SDK guide page**
4. **Click "Download SDK" button**
5. **Verify zip file downloads**
6. **Extract and test SDK**

---

## Complete Code Examples

### Backend: SDK Routes (Already Created)

File: `gloriaconnect_backend/src/api/routes/sdk.routes.ts`

**Endpoints:**
- `GET /docs/sdk/:sdkType/download` - Download SDK as ZIP
- `GET /docs/sdk/:sdkType/info` - Get SDK information
- `GET /docs/sdk/:sdkType/examples` - Get example code

### Frontend: Download Button

File: `gloriaconnect_source/src/components/SdkDownloadButton.tsx` (create this)

### Frontend: Integration in SDK Guide

**Update your existing `SdkGuide.tsx`:**

```tsx
// Add import
import { SdkDownloadButton } from '../../components/SdkDownloadButton';

// Add download button in SDK section
{activeSdk === 'typescript' && (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h2>TypeScript SDK</h2>
      <SdkDownloadButton sdkType="nodejs" />
    </div>
    {/* Rest of your content */}
  </div>
)}
```

---

## Testing Checklist

- [ ] Backend starts without errors
- [ ] SDK info endpoint returns data: `GET /docs/sdk/nodejs/info`
- [ ] SDK download endpoint works: `GET /docs/sdk/nodejs/download`
- [ ] Frontend download button appears
- [ ] Clicking download button downloads ZIP file
- [ ] ZIP file contains SDK files
- [ ] Extracted SDK can be installed and used

---

## Troubleshooting

### Backend: "Cannot find module 'adm-zip'"

**Solution:**
```bash
cd gloriaconnect_backend
npm install adm-zip @types/adm-zip
```

### Backend: "SDK_NOT_FOUND" error

**Solution:**
- Verify SDK directories exist in `gloriaconnect_backend/sdks/`
- Check path: `sdks/nodejs-agent`, `sdks/python-agent`, etc.

### Frontend: Download fails with 401

**Solution:**
- Ensure user is logged in
- Check token is in localStorage
- Verify token is sent in Authorization header

### Frontend: CORS error

**Solution:**
- Backend CORS is already configured
- Check API_BASE_URL is correct
- Verify backend is running

---

## Next Steps After Implementation

1. **Publish SDKs to Package Registries**
   - npm for Node.js
   - PyPI for Python
   - Packagist for PHP

2. **Add More Features**
   - SDK version selection
   - Example code download
   - Setup guide generation

3. **Enhance Frontend**
   - Progress indicator for downloads
   - Download history
   - Installation verification

---

## Summary

**What You Get:**
- ✅ Backend endpoints for SDK download
- ✅ Frontend download button component
- ✅ Complete integration guide
- ✅ Testing instructions

**Time Required:**
- Backend setup: 10 minutes
- Frontend setup: 15 minutes
- Testing: 5 minutes
- **Total: ~30 minutes**

**Ready to start?** Follow the steps above in order!

