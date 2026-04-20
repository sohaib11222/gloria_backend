# Gloria client-supplier integration bundle

> **Role: SOURCE / SUPPLIER** — For **rental companies** exposing OTA XML to Gloria and bridging to `gloria_client_supplier.proto`. **Not** the agent broker `CarHireClient` SDK; agents should use the **Agent** PHP SDK (`php-agent`).

Supplier-side stack: **PHP OTA XML adapter** → **Laravel HTTP API** → **Node gRPC wrapper** ← **Gloria aggregator**.

XML never crosses the gRPC boundary; the aggregator only speaks protobuf + JSON to Laravel.

## Folder structure

```
gloriaconnect_backend/sdks/gloria-source-supplier/
├── proto/
│   └── gloria_client_supplier.proto    # Shared gRPC contract (ClientSupplierService)
├── docs/
│   └── MAPPING.md                      # Maps to supplier.proto + TS otaXmlBuilder / grpc.adapter
├── php/                                 # Composer package gloria/client-supplier-adapter
│   ├── composer.json
│   ├── phpunit.xml
│   ├── src/
│   │   ├── GloraOtaAdapter.php
│   │   ├── Config/AdapterConfig.php
│   │   ├── Exception/SupplierException.php
│   │   ├── Normalizer/OtaResponseNormalizer.php
│   │   └── Xml/                        # OTA RQ builders (mirror backend otaXmlBuilder.ts)
│   └── tests/                          # PHPUnit + XML fixtures
├── laravel/                            # Copy into your Laravel app
│   ├── routes/glora.php
│   ├── config/glora.php
│   ├── app/Http/Controllers/GloraController.php
│   ├── app/Providers/GloraServiceProvider.php
│   └── .env.example
├── node-wrapper/                       # gRPC server → HTTP bridge
│   ├── src/server.ts
│   ├── package.json
│   └── .env.example
└── examples/
    └── aggregator-call-client-wrapper.ts # Sample caller (Gloria / Node)
```

## Quick start

### 1. PHP adapter (library)

```bash
cd php
composer install
composer test   # or: vendor/bin/phpunit
```

Require via Composer path repository from your Laravel app, or copy `src/` under your vendor namespace.

### 2. Laravel

1. Add the Composer package (path repo) or autoload `Gloria\Client\Supplier\` from `php/src`.
2. Copy `laravel/app/Http/Controllers/GloraController.php`, `laravel/config/glora.php`, `laravel/routes/glora.php`, `GloraServiceProvider` (adjust namespaces/paths).
3. Register `GloraServiceProvider` and merge routes.
4. Set `GLORA_SUPPLIER_BASE_URL` to your **supplier OTA HTTP base** (where XML is accepted).

### 3. gRPC wrapper

```bash
cd node-wrapper
npm install
npm run build
set LARAVEL_HTTP_BASE=http://127.0.0.1:8000
set GLORA_CLIENT_GRPC_PORT=50061
npm start
```

### 4. Aggregator example call

```bash
# from bundle root (this folder)
npx tsx examples/aggregator-call-client-wrapper.ts
```

Requires the wrapper running and Laravel answering `/glora/search`.

## Error codes

See `docs/MAPPING.md` and `SupplierException` / gRPC `status` mapping in `node-wrapper/src/server.ts`.

## Reference implementation (Gloria middleware repo)

| Concern | File |
|--------|------|
| OTA_VehAvailRateRQ | `gloriaconnect_backend/src/services/otaXmlBuilder.ts` |
| OTA_VehResRQ | same |
| Parse VehAvailRS | `gloriaconnect_backend/src/adapters/grpc.adapter.ts` (`parseOtaVehAvailResponse`) |
| Legacy source gRPC | `gloriaconnect_backend/src/grpc/proto/supplier.proto` |
