# Branch Import Guide for Sources

**Complete guide for importing branches via XML and JSON endpoints**

---

## Table of Contents

1. [Overview](#overview)
2. [Supported Formats](#supported-formats)
3. [Endpoint Configuration](#endpoint-configuration)
4. [XML Format (Gloria/OTA_VehLocSearchRS)](#xml-format-gloriaotavehlocsearchrs)
5. [JSON Format](#json-format)
6. [File Upload](#file-upload)
7. [Long Polling](#long-polling)
8. [API Reference](#api-reference)
9. [Examples](#examples)
10. [Troubleshooting](#troubleshooting)

---

## Overview

Sources can import branches (locations) into the system using three methods:

1. **Endpoint Import**: Configure an endpoint URL that returns XML or JSON branch data
2. **File Upload**: Upload XML or JSON files directly
3. **Manual Entry**: Create branches one by one through the UI

The system supports both **XML** (Gloria/OTA_VehLocSearchRS format) and **JSON** formats.

---

## Supported Formats

### XML Format

The system supports XML in two root element formats:

1. **Gloria Format** (recommended):
   ```xml
   <gloria xmlns="http://www.opentravel.org/OTA/2003/05">
     ...
   </gloria>
   ```

2. **OTA_VehLocSearchRS Format** (backward compatible):
   ```xml
   <OTA_VehLocSearchRS xmlns="http://www.opentravel.org/OTA/2003/05">
     ...
   </OTA_VehLocSearchRS>
   ```

### JSON Format

Standard JSON with either:
- `{ "CompanyCode": "...", "Branches": [...] }`
- `[{...}, {...}]` (array of branches)

---

## Endpoint Configuration

### Step 1: Configure Branch Endpoint URL

1. Navigate to **Branches** page in the Source dashboard
2. Click **"Configure Endpoint"** button
3. Enter your endpoint URL (e.g., `https://otadev.tlinternationalgroup.com/loctest.php`)
4. Click **"Save Endpoint"**

### Step 2: Import from Endpoint

1. Click **"Import from Endpoint"** button
2. The system will:
   - Fetch data from your configured endpoint
   - Detect format (XML or JSON) automatically
   - Parse and validate branches
   - Import new branches and update existing ones

### API Endpoints

#### GET /sources/branch-endpoint

Get current branch endpoint configuration.

**Response:**
```json
{
  "branchEndpointUrl": "https://example.com/api/branches"
}
```

#### PUT /sources/branch-endpoint

Configure branch endpoint URL.

**Request:**
```json
{
  "branchEndpointUrl": "https://example.com/api/branches"
}
```

**Response:**
```json
{
  "message": "Branch endpoint URL configured successfully",
  "branchEndpointUrl": "https://example.com/api/branches"
}
```

---

## XML Format (Gloria/OTA_VehLocSearchRS)

### Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gloria xmlns="http://www.opentravel.org/OTA/2003/05"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.opentravel.org/OTA/2003/05 OTA_VehLocSearchRS.xsd"
        TimeStamp="2025-04-28T10:30:45"
        Target="Production"
        Version="1.00">
  <Success/>
  <RentalBrand value="RightCars"/>
  <VehMatchedLocs>
    <VehMatchedLoc>
      <LocationDetail Code="DXBA02"
                      Name="Dubai Airport"
                      BranchType="DXBA02"
                      AtAirport="true"
                      LocationType="Outside Airport"
                      Brand="RightCars"
                      Latitude="25.228005"
                      Longitude="55.364241">
        <Address>
          <AddressLine value="Umm Ramool, Marrakech Street, Lootah Group Building, Office No. (214)"/>
          <CityName value="Dubai"/>
          <PostalCode value="000000"/>
          <CountryName value="UNITED ARAB EMIRATES" Code="AE"/>
        </Address>
        <Telephone PhoneNumber="+971 50 766 71 77"/>
        <Opening>
          <monday Open=": 09:00 - 22:00 "/>
          <tuesday Open=": 09:00 - 22:00 "/>
          <wednesday Open=": 09:00 - 22:00 "/>
          <thursday Open=": 09:00 - 22:00 "/>
          <friday Open=": 09:00 - 22:00 "/>
          <saturday Open=": 09:00 - 22:00 "/>
          <sunday Open=": 09:00 - 22:00 "/>
        </Opening>
        <PickupInstructions Pickup="Our Staff will be waiting for you at our Rental Desk, you can call us at 971 50 766 71 77 for any assistance."/>
        <Cars>
          <Code Acrisscode="CCAR" Group="Compact" Make="Hyundai" Model="Accent" Doors="5" Seats="4" DepositAmount=""/>
          <Code Acrisscode="CFAR" Group="Compact" Make="Mitsubishi" Model="ASX" Doors="5" Seats="5" DepositAmount=""/>
        </Cars>
      </LocationDetail>
    </VehMatchedLoc>
  </VehMatchedLocs>
</gloria>
```

### Required Fields

Each `LocationDetail` must include:

- **Code** (attribute): Branch code (unique identifier)
- **Name** (attribute): Branch name
- **Latitude** (attribute or element): Latitude coordinate
- **Longitude** (attribute or element): Longitude coordinate
- **Address**: Complete address information
  - **AddressLine**: Street address
  - **CityName**: City name
  - **PostalCode**: Postal/ZIP code
  - **CountryName**: Country name and code
- **Telephone**: Phone number with `PhoneNumber` attribute
- **EmailAddress**: Contact email (optional but recommended)

### Optional Fields

- **Status**: Branch status (ACTIVE, INACTIVE)
- **LocationType**: AIRPORT, CITY, RAILWAY, etc.
- **CollectionType**: Pickup/dropoff type
- **Opening**: Opening hours for each day
- **PickupInstructions**: Instructions for customers
- **Cars**: Available vehicle types
- **NatoLocode**: UN/LOCODE mapping

---

## JSON Format

### Structure

```json
{
  "CompanyCode": "CMP00023",
  "Branches": [
    {
      "Branchcode": "BR001",
      "Name": "Airport Branch",
      "Status": "ACTIVE",
      "LocationType": "AIRPORT",
      "CollectionType": "PICKUP_DROPOFF",
      "EmailAddress": "branch@example.com",
      "Telephone": {
        "attr": {
          "PhoneNumber": "+1234567890"
        }
      },
      "Latitude": 53.3656,
      "Longitude": -2.2729,
      "Address": {
        "AddressLine": {
          "value": "123 Airport Road"
        },
        "CityName": {
          "value": "Manchester"
        },
        "PostalCode": {
          "value": "M90 1AA"
        },
        "CountryName": {
          "value": "United Kingdom",
          "attr": {
            "Code": "GB"
          }
        }
      },
      "NatoLocode": "GBMAN",
      "Opening": {
        "monday": {
          "attr": {
            "Open": "09:00 - 18:00"
          }
        },
        "tuesday": {
          "attr": {
            "Open": "09:00 - 18:00"
          }
        }
      }
    }
  ]
}
```

### Alternative Format (Array)

You can also provide branches as a direct array:

```json
[
  {
    "Branchcode": "BR001",
    "Name": "Airport Branch",
    ...
  },
  {
    "Branchcode": "BR002",
    "Name": "City Branch",
    ...
  }
]
```

---

## File Upload

### Supported File Types

- **JSON**: `.json` files
- **XML**: `.xml` files

### Upload Process

1. Click **"Upload File"** button
2. Select a JSON or XML file
3. The system will:
   - Validate file format
   - Parse content
   - Validate each branch
   - Import new branches
   - Update existing branches (by branch code)

### File Size Limit

Maximum file size: **5MB**

### Validation

All branches are validated before import:

- Required fields must be present
- Email format must be valid
- Phone number must match pattern `^\+[0-9]{10,15}$`
- Coordinates must be valid numbers
- Address components must be present

---

## Long Polling

The system supports long polling to automatically detect new branches from your endpoint.

### How It Works

1. Configure your branch endpoint URL
2. The system periodically checks the endpoint (every 5 seconds)
3. When new branches are detected, they are automatically imported
4. Duplicate branches (same branch code) are updated, not duplicated

### API Endpoint

#### GET /sources/branches/poll

Poll for new branches from configured endpoint.

**Parameters:**
- `timeout` (optional): Polling timeout in milliseconds (default: 30000, max: 60000)

**Response:**
```json
{
  "message": "New branches found",
  "newCount": 2,
  "totalCount": 15
}
```

Or if no new branches:
```json
{
  "message": "No new branches found",
  "timeout": true
}
```

### Frontend Integration

The frontend can use this endpoint to automatically refresh the branch list when new branches are available.

---

## API Reference

### POST /sources/import-branches

Import branches from configured endpoint.

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "message": "Branches imported successfully",
  "imported": 5,
  "updated": 2,
  "total": 7
}
```

### POST /sources/upload-branches

Upload branches from file (JSON or XML).

**Headers:**
- `Authorization: Bearer <token>`
- `Content-Type: application/json`

**Request Body (JSON format):**
```json
{
  "format": "json",
  "data": "{ ... }"
}
```

**Request Body (XML format):**
```json
{
  "format": "xml",
  "data": "<?xml version=\"1.0\"?>..."
}
```

**Request Body (Direct JSON - backward compatible):**
```json
{
  "CompanyCode": "CMP00023",
  "Branches": [...]
}
```

**Response:**
```json
{
  "message": "Branches uploaded successfully",
  "imported": 3,
  "updated": 1,
  "total": 4
}
```

---

## Examples

### Example 1: Configure Endpoint and Import

```typescript
import { endpointsApi } from './api/endpoints'

// Configure endpoint
await endpointsApi.setBranchEndpoint('https://example.com/api/branches')

// Import branches
const result = await endpointsApi.importBranches()
console.log(`Imported: ${result.imported}, Updated: ${result.updated}`)
```

### Example 2: Upload XML File

```typescript
// Read XML file
const xmlContent = await file.text()

// Upload
const result = await endpointsApi.uploadBranches(xmlContent, 'xml')
```

### Example 3: Upload JSON File

```typescript
// Read JSON file
const jsonContent = await file.text()
const branchesData = JSON.parse(jsonContent)

// Upload
const result = await endpointsApi.uploadBranches(branchesData, 'json')
```

### Example 4: Long Polling

```typescript
// Poll for new branches (30 second timeout)
const result = await endpointsApi.pollBranches(30000)

if (result.newCount) {
  console.log(`Found ${result.newCount} new branches!`)
  // Refresh branch list
}
```

---

## Troubleshooting

### Common Issues

#### 1. "Endpoint not whitelisted"

**Problem**: Your endpoint URL is not in the whitelist.

**Solution**: Contact admin to add your endpoint to the whitelist.

#### 2. "Invalid XML structure"

**Problem**: XML doesn't match expected format.

**Solution**: 
- Ensure root element is `<gloria>` or `<OTA_VehLocSearchRS>`
- Check that `VehMatchedLocs` contains `VehMatchedLoc` elements
- Verify all required fields are present

#### 3. "CompanyCode mismatch"

**Problem**: JSON contains wrong CompanyCode.

**Solution**: Ensure CompanyCode matches your source's companyCode.

#### 4. "No branches found"

**Problem**: Endpoint returns empty or invalid data.

**Solution**:
- Check endpoint URL is correct
- Verify endpoint returns data in expected format
- Check endpoint is accessible from middleware server

#### 5. "Validation failed"

**Problem**: One or more branches fail validation.

**Solution**:
- Check error details in response
- Ensure all required fields are present
- Verify email and phone formats
- Check coordinates are valid numbers

### Best Practices

1. **Use HTTPS**: Always use HTTPS for endpoint URLs in production
2. **Validate Before Upload**: Test your XML/JSON format before uploading
3. **Monitor Imports**: Check import results to ensure all branches were imported
4. **Update Regularly**: Use long polling or scheduled imports to keep branches up-to-date
5. **Handle Errors**: Implement error handling for failed imports
6. **Backup Data**: Keep backups of your branch data

---

## Support

For issues or questions:
- Check the troubleshooting section above
- Review API error messages
- Contact support with endpoint URL and error details

---

## Changelog

### Version 1.0.0
- Initial support for XML (Gloria/OTA_VehLocSearchRS) format
- JSON format support
- Endpoint configuration
- File upload (XML and JSON)
- Long polling for automatic updates
- Duplicate prevention
