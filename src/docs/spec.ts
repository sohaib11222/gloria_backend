// Backend/src/docs/spec.ts

export type DocCodeSample = {
  lang: 'curl' | 'node' | 'php';
  label: string;
  code: string;
};

export type DocEndpoint = {
  id: string;
  name: string;
  summary?: string;
  description?: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  headers?: { name: string; required: boolean; description?: string }[];
  query?: { name: string; required: boolean; type?: string; description?: string }[];
  body?: { name: string; required: boolean; type?: string; description?: string }[];
  responses?: { status: number; description?: string; bodyExample?: any }[];
  codeSamples?: DocCodeSample[];
  roles?: Array<'admin' | 'agent' | 'source'>; // who can see this in UI
};

export type DocCategory = {
  id: string;
  name: string;
  description?: string;
  endpoints: DocEndpoint[];
};

// TODO: change to process.env.APP_URL or config
const BASE_URL = 'http://localhost:8080';

export const DOCS: DocCategory[] = [
  {
    id: 'auth',
    name: 'Authentication',
    description: 'Authenticate and get bearer token.',
    endpoints: [
      {
        id: 'auth-login',
        name: 'Login',
        method: 'POST',
        path: '/auth/login',
        description: 'Get JWT token to call all other endpoints.',
        body: [
          { name: 'email', required: true, type: 'string', description: 'User email' },
          { name: 'password', required: true, type: 'string', description: 'User password' },
        ],
        responses: [
          {
            status: 200,
            description: 'JWT issued',
            bodyExample: { token: 'eyJ...' },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl -X POST ${BASE_URL}/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"admin@example.com","password":"secret"}'`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.post('${BASE_URL}/auth/login', {
  email: 'admin@example.com',
  password: 'secret'
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$ch = curl_init('${BASE_URL}/auth/login');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
  'email' => 'admin@example.com',
  'password' => 'secret',
]));
$out = curl_exec($ch);
echo $out;`,
          },
        ],
        roles: ['admin', 'agent', 'source'],
      },
    ],
  },
  {
    id: 'availability',
    name: 'Availability',
    description: 'Submit → Poll model, OTA-ish payload fields.',
    endpoints: [
      {
        id: 'availability-submit',
        name: 'Submit availability',
        method: 'POST',
        path: '/availability/submit',
        description: 'Submit availability request, fan-out to eligible sources.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        body: [
          { name: 'pickup_unlocode', required: true, type: 'string', description: 'UN/LOCODE e.g. GBMAN' },
          { name: 'dropoff_unlocode', required: true, type: 'string', description: 'UN/LOCODE e.g. GBGLA' },
          { name: 'pickup_iso', required: true, type: 'string', description: 'ISO datetime' },
          { name: 'dropoff_iso', required: true, type: 'string', description: 'ISO datetime' },
          { name: 'driver_age', required: true, type: 'number', description: 'Minimum driver age' },
          { name: 'residency_country', required: true, type: 'string', description: 'ISO-3166 alpha-2' },
          { name: 'vehicle_classes', required: false, type: 'array', description: 'Vehicle class codes' },
          { name: 'agreement_refs', required: true, type: 'array', description: 'Agreement references' },
        ],
        responses: [
          {
            status: 200,
            description: 'Job accepted',
            bodyExample: {
              request_id: '9f0a...',
              status: 'IN_PROGRESS',
              total_expected: 2,
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl -X POST ${BASE_URL}/availability/submit \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"pickup_unlocode":"GBMAN","dropoff_unlocode":"GBGLA","pickup_iso":"2025-11-01T10:00:00Z","dropoff_iso":"2025-11-03T10:00:00Z","driver_age":30,"residency_country":"GB","agreement_refs":["AG-1"]}'`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.post('${BASE_URL}/availability/submit', {
  pickup_unlocode: 'GBMAN',
  dropoff_unlocode: 'GBGLA',
  pickup_iso: '2025-11-01T10:00:00Z',
  dropoff_iso: '2025-11-03T10:00:00Z',
  driver_age: 30,
  residency_country: 'GB',
  agreement_refs: ['AG-1']
}, {
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('POST', '${BASE_URL}/availability/submit', [
  'headers' => [
    'Authorization' => 'Bearer <token>',
    'Content-Type' => 'application/json',
  ],
  'json' => [
    'pickup_unlocode' => 'GBMAN',
    'dropoff_unlocode' => 'GBGLA',
    'pickup_iso' => '2025-11-01T10:00:00Z',
    'dropoff_iso' => '2025-11-03T10:00:00Z',
    'driver_age' => 30,
    'residency_country' => 'GB',
    'agreement_refs' => ['AG-1'],
  ],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['admin', 'agent'],
      },
      {
        id: 'availability-poll',
        name: 'Poll availability',
        method: 'GET',
        path: '/availability/poll',
        description: 'Polls availability results, supports since_seq.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        query: [
          { name: 'requestId', required: true, type: 'string', description: 'job/request id from submit' },
          { name: 'sinceSeq', required: false, type: 'number', description: 'only new chunks' },
          { name: 'waitMs', required: false, type: 'number', description: 'max wait milliseconds' },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl "${BASE_URL}/availability/poll?requestId=9f0a...&sinceSeq=0&waitMs=1500" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.get('${BASE_URL}/availability/poll', {
  params: { requestId: '9f0a...', sinceSeq: 0, waitMs: 1500 },
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('GET', '${BASE_URL}/availability/poll', [
  'query' => ['requestId' => '9f0a...', 'sinceSeq' => 0, 'waitMs' => 1500],
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['admin', 'agent'],
      },
    ],
  },
  {
    id: 'bookings',
    name: 'Bookings',
    description: 'Pass-through to one supplier, fully logged.',
    endpoints: [
      {
        id: 'bookings-create',
        name: 'Create Booking',
        method: 'POST',
        path: '/bookings',
        description: 'Create a booking against a single source, agreement-aware.',
        headers: [
          { name: 'Authorization', required: true, description: 'Bearer <token>' },
          { name: 'Idempotency-Key', required: true, description: 'Unique request ID' },
        ],
        body: [
          { name: 'agreement_ref', required: true, type: 'string', description: 'Agreement reference' },
          { name: 'supplier_offer_ref', required: false, type: 'string', description: 'Supplier offer ref' },
          { name: 'agent_booking_ref', required: false, type: 'string', description: 'Agent booking ref' },
        ],
        responses: [
          {
            status: 200,
            description: 'Booking created',
            bodyExample: { supplier_booking_ref: 'SRC-1234', status: 'CONFIRMED' },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl -X POST ${BASE_URL}/bookings \\
  -H "Authorization: Bearer <token>" \\
  -H "Idempotency-Key: booking_123" \\
  -H "Content-Type: application/json" \\
  -d '{"agreement_ref":"AG-1","supplier_offer_ref":"OFFER_001","agent_booking_ref":"AGENT_BK_123"}'`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.post('${BASE_URL}/bookings', {
  agreement_ref: 'AG-1',
  supplier_offer_ref: 'OFFER_001',
  agent_booking_ref: 'AGENT_BK_123'
}, {
  headers: {
    Authorization: 'Bearer <token>',
    'Idempotency-Key': 'booking_123'
  }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('POST', '${BASE_URL}/bookings', [
  'headers' => [
    'Authorization' => 'Bearer <token>',
    'Idempotency-Key' => 'booking_123',
    'Content-Type' => 'application/json'
  ],
  'json' => [
    'agreement_ref' => 'AG-1',
    'supplier_offer_ref' => 'OFFER_001',
    'agent_booking_ref' => 'AGENT_BK_123'
  ],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['admin', 'agent'],
      },
      {
        id: 'bookings-list',
        name: 'List Bookings',
        method: 'GET',
        path: '/bookings',
        description: 'List recent bookings for the calling company (agent) or all (admin).',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        query: [
          { name: 'limit', required: false, type: 'number', description: 'Max results (default 50)' },
          { name: 'company_id', required: false, type: 'string', description: 'Filter by company (admin only)' },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl "${BASE_URL}/bookings?limit=50" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.get('${BASE_URL}/bookings', {
  params: { limit: 50 },
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('GET', '${BASE_URL}/bookings', [
  'query' => ['limit' => 50],
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['admin', 'agent'],
      },
    ],
  },
  {
    id: 'agreements',
    name: 'Agreements',
    description: 'Offer / accept agreements between Sources and Agents.',
    endpoints: [
      {
        id: 'agreements-list',
        name: 'List agreements',
        method: 'GET',
        path: '/agreements',
        description: 'List agreements visible to the current company.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl "${BASE_URL}/agreements" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.get('${BASE_URL}/agreements', {
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('GET', '${BASE_URL}/agreements', [
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['admin', 'agent', 'source'],
      },
      {
        id: 'agreements-check-duplicate',
        name: 'Check duplicate agreement_ref',
        method: 'POST',
        path: '/agreements/check-duplicate',
        description: 'Check if agreement_ref already exists for this source/agent.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        body: [
          { name: 'agreementRef', required: true, type: 'string', description: 'Agreement reference' },
          { name: 'agentId', required: true, type: 'string', description: 'Agent company ID' },
          { name: 'sourceId', required: true, type: 'string', description: 'Source company ID' },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl -X POST ${BASE_URL}/agreements/check-duplicate \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"agreementRef":"AG-1","agentId":"comp_123","sourceId":"comp_456"}'`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.post('${BASE_URL}/agreements/check-duplicate', {
  agreementRef: 'AG-1',
  agentId: 'comp_123',
  sourceId: 'comp_456'
}, {
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('POST', '${BASE_URL}/agreements/check-duplicate', [
  'headers' => [
    'Authorization' => 'Bearer <token>',
    'Content-Type' => 'application/json'
  ],
  'json' => [
    'agreementRef' => 'AG-1',
    'agentId' => 'comp_123',
    'sourceId' => 'comp_456'
  ],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['admin', 'source'],
      },
    ],
  },
  {
    id: 'locations',
    name: 'Locations',
    description: 'UN/LOCODE + per-agreement location exposure.',
    endpoints: [
      {
        id: 'locations-all',
        name: 'List global locations',
        method: 'GET',
        path: '/locations',
        description: 'Return base UN/LOCODE list.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        query: [
          { name: 'query', required: false, type: 'string', description: 'Search term' },
          { name: 'limit', required: false, type: 'number', description: 'Max results (default 25)' },
          { name: 'cursor', required: false, type: 'string', description: 'Pagination cursor' },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl "${BASE_URL}/locations?query=GBMAN&limit=25" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.get('${BASE_URL}/locations', {
  params: { query: 'GBMAN', limit: 25 },
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('GET', '${BASE_URL}/locations', [
  'query' => ['query' => 'GBMAN', 'limit' => 25],
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['admin', 'agent', 'source'],
      },
      {
        id: 'locations-by-agreement',
        name: 'Locations by agreement',
        method: 'GET',
        path: '/locations/by-agreement/:agreementId',
        description: 'Return only locations supported for this agreement source.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl "${BASE_URL}/locations/by-agreement/agr_123" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.get('${BASE_URL}/locations/by-agreement/agr_123', {
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('GET', '${BASE_URL}/locations/by-agreement/agr_123', [
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['admin', 'agent', 'source'],
      },
    ],
  },
  {
    id: 'health',
    name: 'Health / Auto-heal',
    description: 'Source health, backoff, reset.',
    endpoints: [
      {
        id: 'health-list',
        name: 'List health',
        method: 'GET',
        path: '/admin/health/sources',
        description: 'Admin view of source health.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl "${BASE_URL}/admin/health/sources" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.get('${BASE_URL}/admin/health/sources', {
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('GET', '${BASE_URL}/admin/health/sources', [
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['admin'],
      },
      {
        id: 'health-my-source',
        name: 'My source health',
        method: 'GET',
        path: '/health/my-source',
        description: 'Source can see its own health / exclusion.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl "${BASE_URL}/health/my-source" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.get('${BASE_URL}/health/my-source', {
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('GET', '${BASE_URL}/health/my-source', [
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['source'],
      },
      {
        id: 'health-reset',
        name: 'Reset source health',
        method: 'POST',
        path: '/admin/health/reset/:sourceId',
        description: 'Admin reset of source health.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl -X POST "${BASE_URL}/admin/health/reset/src_123" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.post('${BASE_URL}/admin/health/reset/src_123', {}, {
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('POST', '${BASE_URL}/admin/health/reset/src_123', [
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['admin'],
      },
    ],
  },
];
