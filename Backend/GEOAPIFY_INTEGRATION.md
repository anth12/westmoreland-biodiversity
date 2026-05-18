# Geoapify Image Integration

## Overview
The backend now integrates with the Geoapify API to fetch satellite and terrain imagery for each parcel of land. These images are automatically included in the LLM prompt for ecological analysis.

## Components

### 1. GeoapifyService (`Services/GeoapifyService.cs`)
- **FetchParcelImages()**: Fetches both satellite and terrain images for a given parcel
  - Calculates the center point from the parcel's coordinates (average lat/lng)
  - Calls Geoapify API twice:
    - Satellite image: `osm-bright-smooth` style at zoom level 16
    - Terrain image: `osm-bright` style at zoom level 16
  - Returns images as base64-encoded strings
  
- **FetchImageAsBase64()**: Helper that converts HTTP image response to base64 string

### 2. EstimateEndpoint Updates
- Injects `GeoapifyService` into the endpoint
- Fetches images for all parcels before creating the LLM prompt
- Builds multi-part chat messages with:
  - Text content (location and parcel data)
  - Satellite image for each parcel
  - Terrain image for each parcel

### 3. Dependency Injection (`Program.cs`)
- HttpClient registered for making API calls
- GeoapifyService registered as Transient
- Both are automatically injected where needed

## Configuration
The Geoapify API key is read from:
1. `local.settings.json` - `GEOAPIFY_API_KEY` setting
2. Environment variable - `GEOAPIFY_API_KEY`

Current key (for reference): `97ba831ce00140c4b73ccd5211eb7aef`

## Image Fetch Flow

```
POST /api/Estimate
    ↓
Parse request body (EstimateRequest with parcels)
    ↓
For each parcel:
  - Calculate center point from coordinates
  - Call Geoapify API for satellite image
  - Call Geoapify API for terrain image
  - Convert both to base64
    ↓
Build chat message with:
  - System prompt (analysis instructions)
  - User text (location + parcel data)
  - For each parcel: satellite image + terrain image
    ↓
Send to LLM (Azure OpenAI Chat Completion)
    ↓
Extract JSON response and return EstimateResponse
```

## API Integration Details

### Geoapify Static Map API
- **Endpoint**: `https://api.geoapify.com/v1/staticmap`
- **Method**: GET
- **Parameters**:
  - `style`: Map style (osm-bright-smooth for satellite, osm-bright for terrain)
  - `width`, `height`: Image dimensions (600x400)
  - `center`: lonlat:{lng},{lat} format
  - `zoom`: 16 (detailed local view)
  - `apikey`: Geoapify API key

### Image Format
- Images are fetched as PNG
- Converted to base64 strings
- Embedded in chat messages using data URIs: `data:image/png;base64,...`

## Error Handling
- If Geoapify API key is missing, endpoint returns 400 BadRequest
- If image fetch fails for a parcel, it logs warning and continues
- Images are optional - analysis can proceed without images if fetch fails
- LLM analysis includes visual evidence when available

## Vision Capability
The implementation leverages the OpenAI Vision API through `ChatMessageContentPart`:
- `CreateTextPart()`: For text content
- `CreateImagePart()`: For image URIs (supports base64 data URIs)

This allows the LLM to analyze satellite and terrain imagery alongside text descriptions.

