# Gloria client-supplier mapping

This package sits **on the rental company (supplier) side**: PHP speaks OTA XML to the supplier HTTP endpoint; the Node **gRPC wrapper** exposes protobuf to your **aggregator** (Gloria middleware).

## Architecture

```
Aggregator (Node) --gRPC--> ClientSupplierService (Node wrapper) --HTTP JSON--> Laravel --PHP--> Supplier OTA XML
```

## Proto ↔ legacy `supplier.proto` (middleware ↔ source)

| `ClientSupplierService` (this package) | `supplier.SupplierService` ([gloriaconnect_backend/src/grpc/proto/supplier.proto](../../gloriaconnect_backend/src/grpc/proto/supplier.proto)) |
|----------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| `GetBranches` | `Locations` (returns unlocodes; here we return normalized `Branch{id,name,city}`) |
| `SearchCars` | `Availability` (`AvailabilityReq` → normalized `Car` instead of full `Offer`) |
| `BookCar` | `CreateBooking` (`CreateReq` fields overlap: agreement_ref, supplier_offer_ref, agent_booking_ref) |
| `CancelBooking` | `CancelBooking` (`CancelReq`: supplier_booking_ref ↔ reservation_id) |
| `GetBooking` | `CheckBooking` (`CheckReq`: supplier_booking_ref ↔ reservation_id) |

## TypeScript reference (Gloria middleware) — do not drift without updating PHP

| PHP / behavior | TS reference |
|----------------|--------------|
| `searchCars()` XML request | `buildOtaVehAvailRateRQ` — [otaXmlBuilder.ts](../../../gloriaconnect_backend/src/services/otaXmlBuilder.ts) (lines ~21–67) |
| `bookCar()` XML request | `buildOtaVehResRQ` — same file (lines ~108+) |
| Availability XML → offers | `parseOtaVehAvailResponse` — [grpc.adapter.ts](../../../gloriaconnect_backend/src/adapters/grpc.adapter.ts) (lines ~37–199); normalized **Car** uses `VehID`, `VehMakeModel/@Name`, `TotalCharge/@RateTotalAmount`, `CurrencyCode` |
| Location / branches response shapes | Branch import parsing — [sources.routes.ts](../../../gloriaconnect_backend/src/api/routes/sources.routes.ts) (`OTA_VehLocSearchRS`, `GLORIA_locationlistrs`) |
| Cancel / status **request** XML | **Not** in repo; PHP builders follow same OTA 2003/05 namespace and POS pattern as `otaXmlBuilder.ts` |

## Normalized JSON (PHP → Laravel → gRPC)

**Branch**

```json
{ "id": "DXBA02", "name": "Dubai Airport", "city": "Dubai" }
```

**Car**

```json
{ "id": "CCAR429481853010226", "name": "NISSAN VERSA", "price": 72.37, "currency": "USD" }
```

**Booking**

```json
{ "reservation_id": "ABC123", "status": "CONFIRMED" }
```

## Error codes (aligned across PHP and gRPC)

| Code | Meaning |
|------|---------|
| `CONFIG_ERROR` | Missing URL / credentials |
| `SUPPLIER_TIMEOUT` | HTTP timeout |
| `SUPPLIER_HTTP` | Non-2xx HTTP |
| `SUPPLIER_FAULT` | OTA Errors element or fault string in body |
| `PARSE_ERROR` | XML/JSON parse failure |
| `EMPTY_RESPONSE` | No usable body |
