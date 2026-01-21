# Frontend Branch Import Error Display - Cursor Prompt

## Problem
The branch import endpoint (`/api/sources/import-branches`) now returns detailed validation results:
- **Valid branches are imported** (even if some fail validation)
- **Invalid branches are skipped** with detailed error messages
- **Response includes summary** of imported, updated, invalid, and skipped branches
- **No duplicates** - only new branches are added, existing ones are updated

The frontend needs to properly display:
1. Success message with import summary
2. Validation errors for branches that failed
3. Clear indication of which branches were imported vs skipped
4. Ability to see what needs to be fixed for invalid branches

## Backend Response Format

### Success Response (with some invalid branches):
```json
{
  "message": "2 branch(es) imported successfully, 2 branch(es) skipped due to validation errors",
  "summary": {
    "total": 4,
    "valid": 2,
    "invalid": 2,
    "imported": 2,
    "updated": 0,
    "skipped": 0
  },
  "imported": 2,
  "updated": 0,
  "total": 4,
  "validationErrors": [
    {
      "index": 0,
      "branchCode": "DXBA02",
      "branchName": "Dubai Airport",
      "error": {
        "error": "CompanyCode mismatch: expected \"CMP00004\", got \"missing\"",
        "fields": ["CompanyCode"]
      }
    },
    {
      "index": 1,
      "branchCode": "DXBC02",
      "branchName": "Dubai Downtown",
      "error": {
        "error": "Missing required fields: EmailAddress, Telephone.attr.PhoneNumber",
        "fields": ["EmailAddress", "Telephone.attr.PhoneNumber"]
      }
    }
  ]
}
```

### Complete Success Response:
```json
{
  "message": "All branches imported successfully",
  "summary": {
    "total": 2,
    "valid": 2,
    "invalid": 0,
    "imported": 2,
    "updated": 0,
    "skipped": 0
  },
  "imported": 2,
  "updated": 0,
  "total": 2
}
```

## Frontend Implementation Required

### 1. Update the Import Function/Component

Find the branch import function (likely in a component like `BranchImport.tsx`, `ImportBranches.tsx`, or similar) and update it to:

1. **Handle the new response format**:
   - Check for `validationErrors` array
   - Display summary information
   - Show success/partial success messages appropriately

2. **Display validation errors clearly**:
   - Show a table/list of invalid branches
   - Display branch code, name, and specific error messages
   - Highlight which fields are missing or invalid
   - Make it easy to understand what needs to be fixed

3. **Show import summary**:
   - Total branches processed
   - How many were imported (new)
   - How many were updated (existing)
   - How many were skipped (invalid)
   - How many were valid vs invalid

### 2. UI Components Needed

Create or update components to display:

1. **Success/Partial Success Alert**:
   - Green alert if all branches imported
   - Yellow/warning alert if some branches were skipped
   - Show summary numbers

2. **Validation Errors Table**:
   - Columns: Branch Code, Branch Name, Error Message, Missing Fields
   - Sortable/filterable if many errors
   - Expandable rows to show full error details

3. **Import Summary Card**:
   - Visual summary with numbers
   - Progress indicators
   - Breakdown of imported/updated/skipped

### 3. Example Implementation

```typescript
// Example response handling
const handleImportResponse = (response: any) => {
  if (response.validationErrors && response.validationErrors.length > 0) {
    // Partial success - show errors
    setShowErrors(true);
    setValidationErrors(response.validationErrors);
    setSuccessMessage(
      `${response.summary.valid} branch(es) imported, ${response.summary.invalid} branch(es) skipped`
    );
  } else {
    // Complete success
    setSuccessMessage("All branches imported successfully!");
  }
  
  setImportSummary(response.summary);
};

// Display validation errors
{validationErrors.map((error, idx) => (
  <div key={idx} className="error-item">
    <strong>{error.branchCode}</strong> - {error.branchName}
    <div className="error-message">{error.error.error}</div>
    {error.error.fields && (
      <div className="missing-fields">
        Missing/Invalid: {error.error.fields.join(", ")}
      </div>
    )}
  </div>
))}
```

### 4. Error Message Formatting

Format error messages to be user-friendly:
- "CompanyCode mismatch" → "Branch data doesn't match your company code. Contact support."
- "Missing required fields: EmailAddress" → "Email address is required for this branch"
- "Invalid email format" → "Email address format is invalid"

### 5. Actions After Import

1. **If all branches imported**: Show success, refresh branch list
2. **If some branches skipped**: 
   - Show success for imported branches
   - Show clear error list for skipped branches
   - Provide guidance on how to fix errors
   - Allow user to retry import after fixing issues

### 6. Files to Update

1. **Import component** (e.g., `src/components/BranchImport.tsx` or similar)
   - Update API call handling
   - Add error display component
   - Add summary display

2. **Error display component** (create new or update existing)
   - Table/list of validation errors
   - Error message formatting
   - Field highlighting

3. **API service** (if using a service layer)
   - Update response type definitions
   - Handle new response structure

## Summary

The backend now:
- ✅ Imports valid branches even if some fail
- ✅ Skips invalid branches with detailed errors
- ✅ Prevents duplicates (updates existing, creates new)
- ✅ Returns comprehensive summary

The frontend should:
- ✅ Display import summary clearly
- ✅ Show validation errors in a user-friendly way
- ✅ Indicate which branches were imported vs skipped
- ✅ Help users understand what needs to be fixed
