// Backend/src/docs/spec.ts

export type DocCodeSample = {
  lang: 'curl' | 'node' | 'php' | 'python' | 'java' | 'perl' | 'go';
  label: string;
  code: string;
};

export type DocEndpoint = {
  id: string;
  name: string;
  summary?: string;
  description?: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'gRPC';
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
    description: 'Register, verify email, and authenticate to get bearer token.',
    endpoints: [
      {
        id: 'auth-register',
        name: 'Register Company',
        method: 'POST',
        path: '/auth/register',
        description: 'Register a new company (AGENT or SOURCE). Creates account and sends OTP email for verification.',
        body: [
          { name: 'email', required: true, type: 'string', description: 'Company email address' },
          { name: 'password', required: true, type: 'string', description: 'Password (min 6 characters)' },
          { name: 'companyName', required: true, type: 'string', description: 'Company name' },
          { name: 'type', required: true, type: 'string', description: 'Company type: AGENT or SOURCE' },
        ],
        responses: [
          {
            status: 201,
            description: 'Company registered, OTP sent to email',
            bodyExample: {
              message: 'Registration successful! Please check your email for verification code.',
              email: 'agent@example.com',
              companyName: 'Example Agent',
              status: 'PENDING_VERIFICATION',
            },
          },
          {
            status: 409,
            description: 'Email already exists',
            bodyExample: {
              error: 'CONFLICT',
              message: 'Email already exists',
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl -X POST ${BASE_URL}/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"email":"agent@example.com","password":"secret123","companyName":"Example Agent","type":"AGENT"}'`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.post('${BASE_URL}/auth/register', {
  email: 'agent@example.com',
  password: 'secret123',
  companyName: 'Example Agent',
  type: 'AGENT'
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$ch = curl_init('${BASE_URL}/auth/register');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
  'email' => 'agent@example.com',
  'password' => 'secret123',
  'companyName' => 'Example Agent',
  'type' => 'AGENT',
]));
$out = curl_exec($ch);
echo $out;`,
          },
          {
            lang: 'python',
            label: 'Python',
            code: `import requests
res = requests.post('${BASE_URL}/auth/register', json={
    'email': 'agent@example.com',
    'password': 'secret123',
    'companyName': 'Example Agent',
    'type': 'AGENT'
})
print(res.json())`,
          },
          {
            lang: 'java',
            label: 'Java',
            code: `import java.net.http.*;
import com.fasterxml.jackson.databind.ObjectMapper;
var client = HttpClient.newHttpClient();
var mapper = new ObjectMapper();
var body = Map.of(
    "email", "agent@example.com",
    "password", "secret123",
    "companyName", "Example Agent",
    "type", "AGENT"
);
var request = HttpRequest.newBuilder()
    .uri(URI.create("${BASE_URL}/auth/register"))
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
    .build();
var response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`,
          },
          {
            lang: 'perl',
            label: 'Perl',
            code: `use LWP::UserAgent;
use JSON;
my $ua = LWP::UserAgent->new;
my $json = JSON->new;
my $res = $ua->post('${BASE_URL}/auth/register',
    'Content-Type' => 'application/json',
    Content => $json->encode({
        email => 'agent@example.com',
        password => 'secret123',
        companyName => 'Example Agent',
        type => 'AGENT'
    })
);
print $res->decoded_content;`,
          },
          {
            lang: 'go',
            label: 'Go',
            code: `package main
import (
    "bytes"
    "encoding/json"
    "net/http"
)
func main() {
    data := map[string]string{
        "email": "agent@example.com",
        "password": "secret123",
        "companyName": "Example Agent",
        "type": "AGENT",
    }
    jsonData, _ := json.Marshal(data)
    resp, _ := http.Post("${BASE_URL}/auth/register",
        "application/json", bytes.NewBuffer(jsonData))
    defer resp.Body.Close()
}`,
          },
        ],
        roles: ['admin', 'agent', 'source'],
      },
      {
        id: 'auth-verify-email',
        name: 'Verify Email',
        method: 'POST',
        path: '/auth/verify-email',
        description: 'Verify email address using OTP code sent during registration. Returns JWT tokens upon successful verification.',
        body: [
          { name: 'email', required: true, type: 'string', description: 'Email address used during registration' },
          { name: 'otp', required: true, type: 'string', description: '4-digit OTP code from email' },
        ],
        responses: [
          {
            status: 200,
            description: 'Email verified, JWT tokens issued',
            bodyExample: {
              token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              user: {
                id: 'user_123',
                email: 'agent@example.com',
                companyId: 'cmi4xxhuf00001uqb3zadk8oo',
                role: 'AGENT_USER',
                type: 'AGENT',
              },
            },
          },
          {
            status: 400,
            description: 'Invalid or expired OTP',
            bodyExample: {
              error: 'INVALID_OTP',
              message: 'Invalid or expired OTP code',
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl -X POST ${BASE_URL}/auth/verify-email \\
  -H "Content-Type: application/json" \\
  -d '{"email":"agent@example.com","otp":"1234"}'`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.post('${BASE_URL}/auth/verify-email', {
  email: 'agent@example.com',
  otp: '1234'
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$ch = curl_init('${BASE_URL}/auth/verify-email');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
  'email' => 'agent@example.com',
  'otp' => '1234',
]));
$out = curl_exec($ch);
echo $out;`,
          },
          {
            lang: 'python',
            label: 'Python',
            code: `import requests
res = requests.post('${BASE_URL}/auth/verify-email', json={
    'email': 'agent@example.com',
    'otp': '1234'
})
print(res.json())`,
          },
          {
            lang: 'java',
            label: 'Java',
            code: `import java.net.http.*;
import com.fasterxml.jackson.databind.ObjectMapper;
var client = HttpClient.newHttpClient();
var mapper = new ObjectMapper();
var body = Map.of("email", "agent@example.com", "otp", "1234");
var request = HttpRequest.newBuilder()
    .uri(URI.create("${BASE_URL}/auth/verify-email"))
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
    .build();
var response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`,
          },
          {
            lang: 'perl',
            label: 'Perl',
            code: `use LWP::UserAgent;
use JSON;
my $ua = LWP::UserAgent->new;
my $json = JSON->new;
my $res = $ua->post('${BASE_URL}/auth/verify-email',
    'Content-Type' => 'application/json',
    Content => $json->encode({
        email => 'agent@example.com',
        otp => '1234'
    })
);
print $res->decoded_content;`,
          },
          {
            lang: 'go',
            label: 'Go',
            code: `package main
import (
    "bytes"
    "encoding/json"
    "net/http"
)
func main() {
    data := map[string]string{"email": "agent@example.com", "otp": "1234"}
    jsonData, _ := json.Marshal(data)
    resp, _ := http.Post("${BASE_URL}/auth/verify-email",
        "application/json", bytes.NewBuffer(jsonData))
    defer resp.Body.Close()
}`,
          },
        ],
        roles: ['admin', 'agent', 'source'],
      },
      {
        id: 'auth-login',
        name: 'Login',
        method: 'POST',
        path: '/auth/login',
        description: 'Get JWT token to call all other endpoints. Requires email verification to be completed first.',
        body: [
          { name: 'email', required: true, type: 'string', description: 'User email' },
          { name: 'password', required: true, type: 'string', description: 'User password' },
        ],
        responses: [
          {
            status: 200,
            description: 'JWT issued',
            bodyExample: { 
              token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              user: {
                id: 'user_123',
                email: 'agent@example.com',
                companyId: 'cmi4xxhuf00001uqb3zadk8oo',
                role: 'AGENT_USER',
                type: 'AGENT',
              },
            },
          },
          {
            status: 401,
            description: 'Invalid credentials',
            bodyExample: {
              error: 'UNAUTHORIZED',
              message: 'Invalid email or password',
            },
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
          {
            lang: 'python',
            label: 'Python',
            code: `import requests
res = requests.post('${BASE_URL}/auth/login', json={
    'email': 'admin@example.com',
    'password': 'secret'
})
print(res.json())`,
          },
          {
            lang: 'java',
            label: 'Java',
            code: `import java.net.http.*;
import com.fasterxml.jackson.databind.ObjectMapper;
var client = HttpClient.newHttpClient();
var mapper = new ObjectMapper();
var body = Map.of("email", "admin@example.com", "password", "secret");
var request = HttpRequest.newBuilder()
    .uri(URI.create("${BASE_URL}/auth/login"))
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
    .build();
var response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`,
          },
          {
            lang: 'perl',
            label: 'Perl',
            code: `use LWP::UserAgent;
use JSON;
my $ua = LWP::UserAgent->new;
my $json = JSON->new;
my $res = $ua->post('${BASE_URL}/auth/login',
    'Content-Type' => 'application/json',
    Content => $json->encode({
        email => 'admin@example.com',
        password => 'secret'
    })
);
print $res->decoded_content;`,
          },
          {
            lang: 'go',
            label: 'Go',
            code: `package main
import (
    "bytes"
    "encoding/json"
    "net/http"
)
func main() {
    data := map[string]string{"email": "admin@example.com", "password": "secret"}
    jsonData, _ := json.Marshal(data)
    resp, _ := http.Post("${BASE_URL}/auth/login",
        "application/json", bytes.NewBuffer(jsonData))
    defer resp.Body.Close()
}`,
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
          { name: 'pickup_iso', required: true, type: 'string', description: 'ISO-8601 datetime (e.g. 2025-11-01T10:00:00Z)' },
          { name: 'dropoff_iso', required: true, type: 'string', description: 'ISO-8601 datetime (e.g. 2025-11-03T10:00:00Z)' },
          { name: 'driver_age', required: false, type: 'number', description: 'Driver age (default: 30, min: 18)' },
          { name: 'residency_country', required: false, type: 'string', description: 'ISO-3166 alpha-2 country code (default: US)' },
          { name: 'vehicle_classes', required: false, type: 'array', description: 'Vehicle class codes (e.g. ["ECMN", "CDMR"])' },
          { name: 'agreement_refs', required: true, type: 'array', description: 'Agreement references (required for agents, optional for admins for testing)' },
        ],
        responses: [
          {
            status: 200,
            description: 'Job accepted',
            bodyExample: {
              request_id: 'req_abc123',
              status: 'IN_PROGRESS',
              total_expected: 2,
              responses_received: 0,
            },
          },
          {
            status: 400,
            description: 'Validation error',
            bodyExample: {
              error: 'VALIDATION_ERROR',
              message: 'pickup_unlocode is required',
            },
          },
          {
            status: 400,
            description: 'Agreement refs required',
            bodyExample: {
              error: 'AGREEMENT_REFS_REQUIRED',
              message: 'agreement_refs is required for agent users',
            },
          },
          {
            status: 400,
            description: 'Location not supported',
            bodyExample: {
              error: 'AGREEMENT_LOCATION_DENIED',
              message: 'Location not supported under this agreement',
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
          {
            lang: 'python',
            label: 'Python',
            code: `import requests
res = requests.post('${BASE_URL}/availability/submit', json={
    'pickup_unlocode': 'GBMAN',
    'dropoff_unlocode': 'GBGLA',
    'pickup_iso': '2025-11-01T10:00:00Z',
    'dropoff_iso': '2025-11-03T10:00:00Z',
    'driver_age': 30,
    'residency_country': 'GB',
    'agreement_refs': ['AG-1']
}, headers={'Authorization': 'Bearer <token>'})
print(res.json())`,
          },
          {
            lang: 'java',
            label: 'Java',
            code: `import java.net.http.*;
import com.fasterxml.jackson.databind.ObjectMapper;
var client = HttpClient.newHttpClient();
var mapper = new ObjectMapper();
var body = Map.of(
    "pickup_unlocode", "GBMAN",
    "dropoff_unlocode", "GBGLA",
    "pickup_iso", "2025-11-01T10:00:00Z",
    "dropoff_iso", "2025-11-03T10:00:00Z",
    "driver_age", 30,
    "residency_country", "GB",
    "agreement_refs", List.of("AG-1")
);
var request = HttpRequest.newBuilder()
    .uri(URI.create("${BASE_URL}/availability/submit"))
    .header("Authorization", "Bearer <token>")
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
    .build();
var response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`,
          },
          {
            lang: 'perl',
            label: 'Perl',
            code: `use LWP::UserAgent;
use JSON;
my $ua = LWP::UserAgent->new;
my $json = JSON->new;
my $res = $ua->post('${BASE_URL}/availability/submit',
    'Authorization' => 'Bearer <token>',
    'Content-Type' => 'application/json',
    Content => $json->encode({
        pickup_unlocode => 'GBMAN',
        dropoff_unlocode => 'GBGLA',
        pickup_iso => '2025-11-01T10:00:00Z',
        dropoff_iso => '2025-11-03T10:00:00Z',
        driver_age => 30,
        residency_country => 'GB',
        agreement_refs => ['AG-1']
    })
);
print $res->decoded_content;`,
          },
          {
            lang: 'go',
            label: 'Go',
            code: `package main
import (
    "bytes"
    "encoding/json"
    "net/http"
)
func main() {
    data := map[string]interface{}{
        "pickup_unlocode": "GBMAN",
        "dropoff_unlocode": "GBGLA",
        "pickup_iso": "2025-11-01T10:00:00Z",
        "dropoff_iso": "2025-11-03T10:00:00Z",
        "driver_age": 30,
        "residency_country": "GB",
        "agreement_refs": []string{"AG-1"},
    }
    jsonData, _ := json.Marshal(data)
    req, _ := http.NewRequest("POST", "${BASE_URL}/availability/submit",
        bytes.NewBuffer(jsonData))
    req.Header.Set("Authorization", "Bearer <token>")
    req.Header.Set("Content-Type", "application/json")
    client := &http.Client{}
    resp, _ := client.Do(req)
    defer resp.Body.Close()
}`,
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
          { name: 'requestId', required: true, type: 'string', description: 'Request ID from submit response' },
          { name: 'sinceSeq', required: false, type: 'number', description: 'Sequence number to get only new results (default: 0)' },
          { name: 'waitMs', required: false, type: 'number', description: 'Maximum wait time in milliseconds for new results (default: 1000, max: 15000)' },
        ],
        responses: [
          {
            status: 200,
            description: 'Availability results',
            bodyExample: {
              request_id: 'req_abc123',
              status: 'IN_PROGRESS',
              last_seq: 2,
              complete: false,
              responses_received: 2,
              total_expected: 5,
              offers: [
                {
                  source_id: 'cmi4xxhuf00001uqb3zadk8oo',
                  agreement_ref: 'AG-2025-001',
                  supplier_offer_ref: 'OFFER-1234567890-1',
                  vehicle_class: 'ECMN',
                  vehicle_make_model: 'Toyota Yaris',
                  currency: 'USD',
                  total_price: 45.99,
                  availability_status: 'AVAILABLE',
                  rate_plan_code: 'STANDARD',
                  pickup_location: 'GBMAN',
                  dropoff_location: 'GBGLA',
                },
                {
                  source_id: 'cmi4xxhuf00001uqb3zadk8oo',
                  agreement_ref: 'AG-2025-001',
                  supplier_offer_ref: 'OFFER-1234567890-2',
                  vehicle_class: 'CDMR',
                  vehicle_make_model: 'VW Golf',
                  currency: 'USD',
                  total_price: 67.50,
                  availability_status: 'AVAILABLE',
                  rate_plan_code: 'STANDARD',
                  pickup_location: 'GBMAN',
                  dropoff_location: 'GBGLA',
                },
              ],
            },
          },
          {
            status: 200,
            description: 'Complete - all sources responded',
            bodyExample: {
              request_id: 'req_abc123',
              status: 'COMPLETE',
              last_seq: 5,
              complete: true,
              responses_received: 5,
              total_expected: 5,
              offers: [
                {
                  source_id: 'cmi4xxhuf00001uqb3zadk8oo',
                  agreement_ref: 'AG-2025-001',
                  supplier_offer_ref: 'OFFER-1234567890-1',
                  vehicle_class: 'ECMN',
                  vehicle_make_model: 'Toyota Yaris',
                  currency: 'USD',
                  total_price: 45.99,
                  availability_status: 'AVAILABLE',
                },
              ],
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl "${BASE_URL}/availability/poll?requestId=req_abc123&sinceSeq=0&waitMs=1500" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.get('${BASE_URL}/availability/poll', {
  params: { requestId: 'req_abc123', sinceSeq: 0, waitMs: 1500 },
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
  'query' => ['requestId' => 'req_abc123', 'sinceSeq' => 0, 'waitMs' => 1500],
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
          {
            lang: 'python',
            label: 'Python',
            code: `import requests
res = requests.get('${BASE_URL}/availability/poll', params={
    'requestId': 'req_abc123',
    'sinceSeq': 0,
    'waitMs': 1500
}, headers={'Authorization': 'Bearer <token>'})
print(res.json())`,
          },
          {
            lang: 'java',
            label: 'Java',
            code: `import java.net.http.*;
var client = HttpClient.newHttpClient();
var request = HttpRequest.newBuilder()
    .uri(URI.create("${BASE_URL}/availability/poll?requestId=req_abc123&sinceSeq=0&waitMs=1500"))
    .header("Authorization", "Bearer <token>")
    .GET()
    .build();
var response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`,
          },
          {
            lang: 'perl',
            label: 'Perl',
            code: `use LWP::UserAgent;
use URI;
my $ua = LWP::UserAgent->new;
my $uri = URI->new('${BASE_URL}/availability/poll');
$uri->query_form(requestId => 'req_abc123', sinceSeq => 0, waitMs => 1500);
my $res = $ua->get($uri, 'Authorization' => 'Bearer <token>');
print $res->decoded_content;`,
          },
          {
            lang: 'go',
            label: 'Go',
            code: `package main
import (
    "net/http"
    "net/url"
)
func main() {
    req, _ := http.NewRequest("GET", "${BASE_URL}/availability/poll", nil)
    q := url.Values{}
    q.Add("requestId", "req_abc123")
    q.Add("sinceSeq", "0")
    q.Add("waitMs", "1500")
    req.URL.RawQuery = q.Encode()
    req.Header.Set("Authorization", "Bearer <token>")
    client := &http.Client{}
    resp, _ := client.Do(req)
    defer resp.Body.Close()
}`,
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
            description: 'Booking created successfully',
            bodyExample: { 
              supplier_booking_ref: 'BKG-2025-12345', 
              status: 'CONFIRMED',
              agent_booking_ref: 'AGENT_BK_123'
            },
          },
          {
            status: 400,
            description: 'Missing Idempotency-Key header',
            bodyExample: { 
              error: 'SCHEMA_ERROR', 
              message: 'Missing Idempotency-Key header' 
            },
          },
          {
            status: 409,
            description: 'Agreement not active',
            bodyExample: { 
              error: 'AGREEMENT_INACTIVE', 
              message: 'Agreement not active or not found for this agent/source' 
            },
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
          {
            lang: 'python',
            label: 'Python',
            code: `import requests
res = requests.post('${BASE_URL}/bookings', json={
    'agreement_ref': 'AG-1',
    'supplier_offer_ref': 'OFFER_001',
    'agent_booking_ref': 'AGENT_BK_123'
}, headers={
    'Authorization': 'Bearer <token>',
    'Idempotency-Key': 'booking_123'
})
print(res.json())`,
          },
          {
            lang: 'java',
            label: 'Java',
            code: `import java.net.http.*;
import com.fasterxml.jackson.databind.ObjectMapper;
var client = HttpClient.newHttpClient();
var mapper = new ObjectMapper();
var body = Map.of(
    "agreement_ref", "AG-1",
    "supplier_offer_ref", "OFFER_001",
    "agent_booking_ref", "AGENT_BK_123"
);
var request = HttpRequest.newBuilder()
    .uri(URI.create("${BASE_URL}/bookings"))
    .header("Authorization", "Bearer <token>")
    .header("Idempotency-Key", "booking_123")
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
    .build();
var response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`,
          },
          {
            lang: 'perl',
            label: 'Perl',
            code: `use LWP::UserAgent;
use JSON;
my $ua = LWP::UserAgent->new;
my $json = JSON->new;
my $res = $ua->post('${BASE_URL}/bookings',
    'Authorization' => 'Bearer <token>',
    'Idempotency-Key' => 'booking_123',
    'Content-Type' => 'application/json',
    Content => $json->encode({
        agreement_ref => 'AG-1',
        supplier_offer_ref => 'OFFER_001',
        agent_booking_ref => 'AGENT_BK_123'
    })
);
print $res->decoded_content;`,
          },
          {
            lang: 'go',
            label: 'Go',
            code: `package main
import (
    "bytes"
    "encoding/json"
    "net/http"
)
func main() {
    data := map[string]string{
        "agreement_ref": "AG-1",
        "supplier_offer_ref": "OFFER_001",
        "agent_booking_ref": "AGENT_BK_123",
    }
    jsonData, _ := json.Marshal(data)
    req, _ := http.NewRequest("POST", "${BASE_URL}/bookings", bytes.NewBuffer(jsonData))
    req.Header.Set("Authorization", "Bearer <token>")
    req.Header.Set("Idempotency-Key", "booking_123")
    req.Header.Set("Content-Type", "application/json")
    client := &http.Client{}
    resp, _ := client.Do(req)
    defer resp.Body.Close()
}`,
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
          { name: 'limit', required: false, type: 'number', description: 'Max results (default 50, max 200)' },
          { name: 'company_id', required: false, type: 'string', description: 'Filter by company ID (admin only)' },
          { name: 'request_id', required: false, type: 'string', description: 'Filter by request ID' },
        ],
        responses: [
          {
            status: 200,
            description: 'List of bookings',
            bodyExample: {
              data: [
                {
                  id: 'booking_123',
                  agentId: 'cmi4xxhuf00001uqb3zadk8oo',
                  sourceId: 'cmi49dpj9000080owwfvew9c8',
                  agreementRef: 'AG-2025-001',
                  supplierBookingRef: 'BKG-2025-12345',
                  agentBookingRef: 'AGENT_BK_123',
                  status: 'CONFIRMED',
                  createdAt: '2025-11-18T10:00:00Z',
                },
              ],
              items: [
                {
                  id: 'booking_123',
                  agentId: 'cmi4xxhuf00001uqb3zadk8oo',
                  sourceId: 'cmi49dpj9000080owwfvew9c8',
                  agreementRef: 'AG-2025-001',
                  supplierBookingRef: 'BKG-2025-12345',
                  agentBookingRef: 'AGENT_BK_123',
                  status: 'CONFIRMED',
                  createdAt: '2025-11-18T10:00:00Z',
                },
              ],
            },
          },
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
          {
            lang: 'python',
            label: 'Python',
            code: `import requests
res = requests.get('${BASE_URL}/bookings', params={'limit': 50},
    headers={'Authorization': 'Bearer <token>'})
print(res.json())`,
          },
          {
            lang: 'java',
            label: 'Java',
            code: `import java.net.http.*;
var client = HttpClient.newHttpClient();
var request = HttpRequest.newBuilder()
    .uri(URI.create("${BASE_URL}/bookings?limit=50"))
    .header("Authorization", "Bearer <token>")
    .GET()
    .build();
var response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`,
          },
          {
            lang: 'perl',
            label: 'Perl',
            code: `use LWP::UserAgent;
use URI;
my $ua = LWP::UserAgent->new;
my $uri = URI->new('${BASE_URL}/bookings');
$uri->query_form(limit => 50);
my $res = $ua->get($uri, 'Authorization' => 'Bearer <token>');
print $res->decoded_content;`,
          },
          {
            lang: 'go',
            label: 'Go',
            code: `package main
import (
    "net/http"
    "net/url"
)
func main() {
    req, _ := http.NewRequest("GET", "${BASE_URL}/bookings", nil)
    q := url.Values{}
    q.Add("limit", "50")
    req.URL.RawQuery = q.Encode()
    req.Header.Set("Authorization", "Bearer <token>")
    client := &http.Client{}
    resp, _ := client.Do(req)
    defer resp.Body.Close()
}`,
          },
        ],
        roles: ['admin', 'agent'],
      },
      {
        id: 'bookings-get',
        name: 'Get Booking Status',
        method: 'GET',
        path: '/bookings/:ref',
        description: 'Check booking status by supplier booking reference. Requires agreement_ref query parameter.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        query: [
          { name: 'agreement_ref', required: true, type: 'string', description: 'Agreement reference' },
        ],
        responses: [
          {
            status: 200,
            description: 'Booking status',
            bodyExample: {
              supplier_booking_ref: 'BKG-2025-12345',
              status: 'CONFIRMED',
            },
          },
          {
            status: 409,
            description: 'Agreement not active',
            bodyExample: {
              error: 'AGREEMENT_INACTIVE',
              message: 'Agreement not active or not found for this agent/source',
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl "${BASE_URL}/bookings/BKG-2025-12345?agreement_ref=AG-2025-001" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.get('${BASE_URL}/bookings/BKG-2025-12345', {
  params: { agreement_ref: 'AG-2025-001' },
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('GET', '${BASE_URL}/bookings/BKG-2025-12345', [
  'query' => ['agreement_ref' => 'AG-2025-001'],
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
          {
            lang: 'python',
            label: 'Python',
            code: `import requests
res = requests.get('${BASE_URL}/bookings/BKG-2025-12345', params={
    'agreement_ref': 'AG-2025-001'
}, headers={'Authorization': 'Bearer <token>'})
print(res.json())`,
          },
          {
            lang: 'java',
            label: 'Java',
            code: `import java.net.http.*;
var client = HttpClient.newHttpClient();
var request = HttpRequest.newBuilder()
    .uri(URI.create("${BASE_URL}/bookings/BKG-2025-12345?agreement_ref=AG-2025-001"))
    .header("Authorization", "Bearer <token>")
    .GET()
    .build();
var response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`,
          },
          {
            lang: 'perl',
            label: 'Perl',
            code: `use LWP::UserAgent;
use URI;
my $ua = LWP::UserAgent->new;
my $uri = URI->new('${BASE_URL}/bookings/BKG-2025-12345');
$uri->query_form(agreement_ref => 'AG-2025-001');
my $res = $ua->get($uri, 'Authorization' => 'Bearer <token>');
print $res->decoded_content;`,
          },
          {
            lang: 'go',
            label: 'Go',
            code: `package main
import (
    "net/http"
    "net/url"
)
func main() {
    req, _ := http.NewRequest("GET", "${BASE_URL}/bookings/BKG-2025-12345", nil)
    q := url.Values{}
    q.Add("agreement_ref", "AG-2025-001")
    req.URL.RawQuery = q.Encode()
    req.Header.Set("Authorization", "Bearer <token>")
    client := &http.Client{}
    resp, _ := client.Do(req)
    defer resp.Body.Close()
}`,
          },
        ],
        roles: ['admin', 'agent'],
      },
      {
        id: 'bookings-modify',
        name: 'Modify Booking',
        method: 'PATCH',
        path: '/bookings/:ref',
        description: 'Modify an existing booking. Requires agreement_ref query parameter.',
        headers: [
          { name: 'Authorization', required: true, description: 'Bearer <token>' },
          { name: 'Idempotency-Key', required: true, description: 'Unique request ID for idempotency' },
        ],
        query: [
          { name: 'agreement_ref', required: true, type: 'string', description: 'Agreement reference' },
        ],
        body: [
          { name: 'modifications', required: false, type: 'object', description: 'Booking modification data (optional, depends on supplier support)' },
        ],
        responses: [
          {
            status: 200,
            description: 'Booking modified successfully',
            bodyExample: {
              supplier_booking_ref: 'BKG-2025-12345',
              status: 'CONFIRMED',
            },
          },
          {
            status: 409,
            description: 'Agreement not active',
            bodyExample: {
              error: 'AGREEMENT_INACTIVE',
              message: 'Agreement not active or not found for this agent/source',
            },
          },
          {
            status: 502,
            description: 'Upstream error',
            bodyExample: {
              error: 'UPSTREAM_ERROR',
              message: 'Supplier error message',
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl -X PATCH "${BASE_URL}/bookings/BKG-2025-12345?agreement_ref=AG-2025-001" \\
  -H "Authorization: Bearer <token>" \\
  -H "Idempotency-Key: modify_123" \\
  -H "Content-Type: application/json" \\
  -d '{"modifications":{}}'`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.patch('${BASE_URL}/bookings/BKG-2025-12345', {
  modifications: {}
}, {
  params: { agreement_ref: 'AG-2025-001' },
  headers: {
    Authorization: 'Bearer <token>',
    'Idempotency-Key': 'modify_123'
  }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('PATCH', '${BASE_URL}/bookings/BKG-2025-12345', [
  'query' => ['agreement_ref' => 'AG-2025-001'],
  'headers' => [
    'Authorization' => 'Bearer <token>',
    'Idempotency-Key' => 'modify_123',
    'Content-Type' => 'application/json'
  ],
  'json' => ['modifications' => []]
]);
echo $res->getBody();`,
          },
        ],
        roles: ['admin', 'agent'],
      },
      {
        id: 'bookings-cancel',
        name: 'Cancel Booking',
        method: 'POST',
        path: '/bookings/:ref/cancel',
        description: 'Cancel an existing booking. Requires agreement_ref query parameter.',
        headers: [
          { name: 'Authorization', required: true, description: 'Bearer <token>' },
          { name: 'Idempotency-Key', required: true, description: 'Unique request ID for idempotency' },
        ],
        query: [
          { name: 'agreement_ref', required: true, type: 'string', description: 'Agreement reference' },
        ],
        responses: [
          {
            status: 200,
            description: 'Booking cancelled successfully',
            bodyExample: {
              supplier_booking_ref: 'BKG-2025-12345',
              status: 'CANCELLED',
            },
          },
          {
            status: 409,
            description: 'Agreement not active',
            bodyExample: {
              error: 'AGREEMENT_INACTIVE',
              message: 'Agreement not active or not found for this agent/source',
            },
          },
          {
            status: 502,
            description: 'Upstream error',
            bodyExample: {
              error: 'UPSTREAM_ERROR',
              message: 'Supplier error message',
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl -X POST "${BASE_URL}/bookings/BKG-2025-12345/cancel?agreement_ref=AG-2025-001" \\
  -H "Authorization: Bearer <token>" \\
  -H "Idempotency-Key: cancel_123"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.post('${BASE_URL}/bookings/BKG-2025-12345/cancel', {}, {
  params: { agreement_ref: 'AG-2025-001' },
  headers: {
    Authorization: 'Bearer <token>',
    'Idempotency-Key': 'cancel_123'
  }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('POST', '${BASE_URL}/bookings/BKG-2025-12345/cancel', [
  'query' => ['agreement_ref' => 'AG-2025-001'],
  'headers' => [
    'Authorization' => 'Bearer <token>',
    'Idempotency-Key' => 'cancel_123'
  ],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['admin', 'agent'],
      },
      {
        id: 'bookings-check',
        name: 'Check Booking Status',
        method: 'GET',
        path: '/bookings/:ref',
        description: 'Check the status of an existing booking. Requires agreement_ref query parameter. (Same as Get Booking)',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        query: [
          { name: 'agreement_ref', required: true, type: 'string', description: 'Agreement reference' },
        ],
        responses: [
          {
            status: 200,
            description: 'Booking status',
            bodyExample: {
              supplier_booking_ref: 'BKG-2025-12345',
              status: 'CONFIRMED',
            },
          },
          {
            status: 409,
            description: 'Agreement not active',
            bodyExample: {
              error: 'AGREEMENT_INACTIVE',
              message: 'Agreement not active or not found for this agent/source',
            },
          },
          {
            status: 502,
            description: 'Upstream error',
            bodyExample: {
              error: 'UPSTREAM_ERROR',
              message: 'Supplier error message',
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl "${BASE_URL}/bookings/BKG-2025-12345?agreement_ref=AG-2025-001" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.get('${BASE_URL}/bookings/BKG-2025-12345', {
  params: { agreement_ref: 'AG-2025-001' },
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('GET', '${BASE_URL}/bookings/BKG-2025-12345', [
  'query' => ['agreement_ref' => 'AG-2025-001'],
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
        description: 'List agreements visible to the current company. For agents, lists their agreements. Use scope=agent or scope=source to filter.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        query: [
          { name: 'scope', required: false, type: 'string', description: 'Filter by scope: agent (default) or source' },
          { name: 'status', required: false, type: 'string', description: 'Filter by status (e.g. ACTIVE, OFFERED, ACCEPTED)' },
        ],
        responses: [
          {
            status: 200,
            description: 'List of agreements',
            bodyExample: {
              items: [
                {
                  id: 'agr_123',
                  agentId: 'cmi4xxhuf00001uqb3zadk8oo',
                  sourceId: 'cmi49dpj9000080owwfvew9c8',
                  agreementRef: 'AG-2025-001',
                  status: 'ACTIVE',
                  validFrom: '2025-01-01T00:00:00Z',
                  validTo: '2025-12-31T23:59:59Z',
                  createdAt: '2025-01-01T00:00:00Z',
                  updatedAt: '2025-01-01T00:00:00Z',
                },
              ],
              total: 1,
            },
          },
        ],
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
      {
        id: 'agreements-create',
        name: 'Create Agreement (Draft)',
        method: 'POST',
        path: '/agreements',
        description: 'Source creates a draft agreement targeting an Agent.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        body: [
          { name: 'agent_id', required: true, type: 'string', description: 'Agent company ID' },
          { name: 'source_id', required: true, type: 'string', description: 'Source company ID' },
          { name: 'agreement_ref', required: true, type: 'string', description: 'Agreement reference' },
          { name: 'valid_from', required: false, type: 'string', description: 'Valid from date (ISO)' },
          { name: 'valid_to', required: false, type: 'string', description: 'Valid to date (ISO)' },
        ],
        roles: ['admin', 'source'],
      },
      {
        id: 'agreements-offer',
        name: 'Offer Agreement',
        method: 'POST',
        path: '/agreements/:id/offer',
        description: 'Source offers an agreement to an Agent.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        roles: ['admin', 'source'],
      },
      {
        id: 'agreements-get',
        name: 'Get Agreement Details',
        method: 'GET',
        path: '/agreements/:id',
        description: 'Get agreement details by ID. Accessible by admin, the agreement\'s agent, or the agreement\'s source.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        responses: [
          {
            status: 200,
            description: 'Agreement details',
            bodyExample: {
              id: 'agr_123',
              agentId: 'cmi4xxhuf00001uqb3zadk8oo',
              sourceId: 'cmi49dpj9000080owwfvew9c8',
              agreementRef: 'AG-2025-001',
              status: 'ACTIVE',
              validFrom: '2025-01-01T00:00:00Z',
              validTo: '2025-12-31T23:59:59Z',
              agent: {
                id: 'cmi4xxhuf00001uqb3zadk8oo',
                companyName: 'Example Agent',
                email: 'agent@example.com',
                type: 'AGENT',
                status: 'ACTIVE',
                companyCode: 'CMP00023',
              },
              source: {
                id: 'cmi49dpj9000080owwfvew9c8',
                companyName: 'Example Source',
                email: 'source@example.com',
                type: 'SOURCE',
                status: 'ACTIVE',
                companyCode: 'CMP00024',
              },
              createdAt: '2025-01-01T00:00:00Z',
              updatedAt: '2025-01-01T00:00:00Z',
            },
          },
          {
            status: 404,
            description: 'Agreement not found',
            bodyExample: {
              error: 'NOT_FOUND',
              message: 'Agreement not found',
            },
          },
          {
            status: 403,
            description: 'Access denied',
            bodyExample: {
              error: 'FORBIDDEN',
              message: 'Access denied',
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl "${BASE_URL}/agreements/agr_123" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.get('${BASE_URL}/agreements/agr_123', {
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('GET', '${BASE_URL}/agreements/agr_123', [
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['admin', 'agent', 'source'],
      },
      {
        id: 'agreements-offers',
        name: 'List Agreement Offers (Agent)',
        method: 'GET',
        path: '/agreements/offers',
        description: 'Agent gets all agreement offers from sources. Returns agreements where the agent is the target.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        query: [
          { name: 'status', required: false, type: 'string', description: 'Filter by status (e.g. OFFERED, ACCEPTED, ACTIVE)' },
        ],
        responses: [
          {
            status: 200,
            description: 'List of agreement offers',
            bodyExample: {
              items: [
                {
                  id: 'agr_123',
                  agentId: 'cmi4xxhuf00001uqb3zadk8oo',
                  sourceId: 'cmi49dpj9000080owwfvew9c8',
                  agreementRef: 'AG-2025-001',
                  status: 'OFFERED',
                  validFrom: '2025-01-01T00:00:00Z',
                  validTo: '2025-12-31T23:59:59Z',
                  createdAt: '2025-01-01T00:00:00Z',
                  updatedAt: '2025-01-01T00:00:00Z',
                },
              ],
              total: 1,
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl "${BASE_URL}/agreements/offers?status=OFFERED" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.get('${BASE_URL}/agreements/offers', {
  params: { status: 'OFFERED' },
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('GET', '${BASE_URL}/agreements/offers', [
  'query' => ['status' => 'OFFERED'],
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['admin', 'agent'],
      },
      {
        id: 'agreements-accept',
        name: 'Accept Agreement',
        method: 'POST',
        path: '/agreements/:id/accept',
        description: 'Agent accepts an offered agreement. Changes status from OFFERED to ACCEPTED.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        responses: [
          {
            status: 200,
            description: 'Agreement accepted',
            bodyExample: {
              id: 'agr_123',
              agentId: 'cmi4xxhuf00001uqb3zadk8oo',
              sourceId: 'cmi49dpj9000080owwfvew9c8',
              agreementRef: 'AG-2025-001',
              status: 'ACCEPTED',
              validFrom: '2025-01-01T00:00:00Z',
              validTo: '2025-12-31T23:59:59Z',
              createdAt: '2025-01-01T00:00:00Z',
              updatedAt: '2025-01-01T00:00:00Z',
            },
          },
          {
            status: 400,
            description: 'Invalid request',
            bodyExample: {
              error: 'BAD_REQUEST',
              message: 'Agreement is not in OFFERED status',
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl -X POST "${BASE_URL}/agreements/agr_123/accept" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.post('${BASE_URL}/agreements/agr_123/accept', {}, {
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('POST', '${BASE_URL}/agreements/agr_123/accept', [
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['admin', 'agent'],
      },
      {
        id: 'agreements-activate',
        name: 'Activate Agreement',
        method: 'POST',
        path: '/agreements/:id/activate',
        description: 'Activate an agreement (set status to ACTIVE). Can be called by agent or admin after agreement is ACCEPTED.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        responses: [
          {
            status: 200,
            description: 'Agreement activated',
            bodyExample: {
              id: 'agr_123',
              agentId: 'cmi4xxhuf00001uqb3zadk8oo',
              sourceId: 'cmi49dpj9000080owwfvew9c8',
              agreementRef: 'AG-2025-001',
              status: 'ACTIVE',
              validFrom: '2025-01-01T00:00:00Z',
              validTo: '2025-12-31T23:59:59Z',
              createdAt: '2025-01-01T00:00:00Z',
              updatedAt: '2025-01-01T00:00:00Z',
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl -X POST "${BASE_URL}/agreements/agr_123/activate" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.post('${BASE_URL}/agreements/agr_123/activate', {}, {
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('POST', '${BASE_URL}/agreements/agr_123/activate', [
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
    id: 'locations',
    name: 'Locations',
    description: 'UN/LOCODE + per-agreement location exposure.',
    endpoints: [
      {
        id: 'locations-all',
        name: 'List Global Locations',
        method: 'GET',
        path: '/locations',
        description: 'List/search UN/LOCODE entries. Returns paginated list of locations from the UN/LOCODE database.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        query: [
          { name: 'query', required: false, type: 'string', description: 'Search term (searches in unlocode, place, country)' },
          { name: 'limit', required: false, type: 'number', description: 'Max results (default 25, max 100)' },
          { name: 'cursor', required: false, type: 'string', description: 'Pagination cursor for next page' },
        ],
        responses: [
          {
            status: 200,
            description: 'List of locations',
            bodyExample: {
              items: [
                {
                  unlocode: 'GBMAN',
                  country: 'GB',
                  place: 'Manchester',
                  iataCode: 'MAN',
                  latitude: 53.3656,
                  longitude: -2.2729,
                },
                {
                  unlocode: 'GBGLA',
                  country: 'GB',
                  place: 'Glasgow',
                  iataCode: 'GLA',
                  latitude: 55.8642,
                  longitude: -4.2518,
                },
              ],
              total: 2,
              nextCursor: 'GBGLA',
              hasMore: true,
            },
          },
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
        name: 'Locations by Agreement',
        method: 'GET',
        path: '/agreements/:id/locations',
        description: 'Get locations covered by a specific agreement. Returns effective coverage (base source coverage ∪ allow overrides − deny overrides).',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        responses: [
          {
            status: 200,
            description: 'Agreement locations',
            bodyExample: {
              agreement_id: 'agr_123',
              locations: [
                {
                  unlocode: 'GBMAN',
                  country: 'GB',
                  place: 'Manchester',
                  iataCode: 'MAN',
                  latitude: 53.3656,
                  longitude: -2.2729,
                },
                {
                  unlocode: 'GBGLA',
                  country: 'GB',
                  place: 'Glasgow',
                  iataCode: 'GLA',
                  latitude: 55.8642,
                  longitude: -4.2518,
                },
              ],
              total: 2,
            },
          },
          {
            status: 404,
            description: 'Agreement not found',
            bodyExample: {
              error: 'NOT_FOUND',
              message: 'Agreement not found',
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl "${BASE_URL}/agreements/agr_123/locations" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.get('${BASE_URL}/agreements/agr_123/locations', {
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('GET', '${BASE_URL}/agreements/agr_123/locations', [
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
  {
    id: 'branches',
    name: 'Branch Management',
    description: 'Manage rental branches (locations) for sources.',
    endpoints: [
      {
        id: 'branches-list-admin',
        name: 'List All Branches (Admin)',
        method: 'GET',
        path: '/admin/branches',
        description: 'List all branches across all sources (admin only).',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        query: [
          { name: 'sourceId', required: false, type: 'string', description: 'Filter by source ID' },
          { name: 'status', required: false, type: 'string', description: 'Filter by status' },
          { name: 'locationType', required: false, type: 'string', description: 'Filter by location type' },
          { name: 'search', required: false, type: 'string', description: 'Search in branch code, name, city' },
          { name: 'limit', required: false, type: 'number', description: 'Max results (default 25)' },
          { name: 'offset', required: false, type: 'number', description: 'Pagination offset (default 0)' },
        ],
        roles: ['admin'],
      },
      {
        id: 'branches-get-admin',
        name: 'Get Branch (Admin)',
        method: 'GET',
        path: '/admin/branches/:id',
        description: 'Get branch details by ID (admin only).',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        roles: ['admin'],
      },
      {
        id: 'branches-update-admin',
        name: 'Update Branch (Admin)',
        method: 'PATCH',
        path: '/admin/branches/:id',
        description: 'Update branch details (admin only).',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        body: [
          { name: 'name', required: false, type: 'string', description: 'Branch name' },
          { name: 'status', required: false, type: 'string', description: 'Branch status' },
          { name: 'natoLocode', required: false, type: 'string', description: 'UN/LOCODE mapping' },
        ],
        roles: ['admin'],
      },
      {
        id: 'branches-delete-admin',
        name: 'Delete Branch (Admin)',
        method: 'DELETE',
        path: '/admin/branches/:id',
        description: 'Delete a branch (admin only).',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        roles: ['admin'],
      },
      {
        id: 'branches-list-source',
        name: 'List Own Branches (Source)',
        method: 'GET',
        path: '/sources/branches',
        description: 'List branches for the authenticated source company.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        query: [
          { name: 'status', required: false, type: 'string', description: 'Filter by status' },
          { name: 'locationType', required: false, type: 'string', description: 'Filter by location type' },
          { name: 'search', required: false, type: 'string', description: 'Search in branch code, name, city' },
          { name: 'limit', required: false, type: 'number', description: 'Max results (default 25)' },
          { name: 'offset', required: false, type: 'number', description: 'Pagination offset (default 0)' },
        ],
        roles: ['source'],
      },
      {
        id: 'branches-get-source',
        name: 'Get Own Branch (Source)',
        method: 'GET',
        path: '/sources/branches/:id',
        description: 'Get own branch details by ID.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        roles: ['source'],
      },
      {
        id: 'branches-update-source',
        name: 'Update Own Branch (Source)',
        method: 'PATCH',
        path: '/sources/branches/:id',
        description: 'Update own branch details, especially natoLocode mapping.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        body: [
          { name: 'name', required: false, type: 'string', description: 'Branch name' },
          { name: 'natoLocode', required: false, type: 'string', description: 'UN/LOCODE mapping' },
        ],
        roles: ['source'],
      },
      {
        id: 'branches-import',
        name: 'Import Branches',
        method: 'POST',
        path: '/sources/import-branches',
        description: 'Import branches from supplier HTTP endpoint.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        roles: ['source'],
      },
      {
        id: 'branches-upload',
        name: 'Upload Branches',
        method: 'POST',
        path: '/sources/upload-branches',
        description: 'Upload branches from a JSON file. Accepts JSON in request body with format: { CompanyCode: string, Branches: [...] } or array of branches.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        body: [
          { name: 'CompanyCode', required: false, type: 'string', description: 'Company code (validated against source companyCode)' },
          { name: 'Branches', required: true, type: 'array', description: 'Array of branch objects. Can also be provided as root array.' },
        ],
        responses: [
          {
            status: 200,
            description: 'Branches uploaded successfully',
            bodyExample: {
              message: 'Branches uploaded successfully',
              imported: 5,
              updated: 2,
              total: 7,
            },
          },
          {
            status: 422,
            description: 'Validation failed',
            bodyExample: {
              error: 'VALIDATION_FAILED',
              message: '2 branch(es) failed validation',
              errors: [],
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl -X POST "${BASE_URL}/sources/upload-branches" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d @branches.json`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
import fs from 'fs';

const branchesData = JSON.parse(fs.readFileSync('branches.json', 'utf8'));
const res = await axios.post('${BASE_URL}/sources/upload-branches', branchesData, {
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$branchesData = json_decode(file_get_contents('branches.json'), true);
$res = $client->request('POST', '${BASE_URL}/sources/upload-branches', [
  'headers' => [
    'Authorization' => 'Bearer <token>',
    'Content-Type' => 'application/json'
  ],
  'json' => $branchesData
]);
echo $res->getBody();`,
          },
          {
            lang: 'python',
            label: 'Python',
            code: `import requests
import json

with open('branches.json', 'r') as f:
    branches_data = json.load(f)

res = requests.post('${BASE_URL}/sources/upload-branches', 
    json=branches_data,
    headers={'Authorization': 'Bearer <token>'})
print(res.json())`,
          },
          {
            lang: 'java',
            label: 'Java',
            code: `import java.net.http.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Paths;

var client = HttpClient.newHttpClient();
var mapper = new ObjectMapper();
String json = Files.readString(Paths.get("branches.json"));
var branchesData = mapper.readValue(json, Map.class);
var request = HttpRequest.newBuilder()
    .uri(URI.create("${BASE_URL}/sources/upload-branches"))
    .header("Authorization", "Bearer <token>")
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(branchesData)))
    .build();
var response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`,
          },
          {
            lang: 'perl',
            label: 'Perl',
            code: `use LWP::UserAgent;
use JSON;
use File::Slurp;

my $ua = LWP::UserAgent->new;
my $json = JSON->new;
my $file_content = read_file('branches.json');
my $branches_data = $json->decode($file_content);
my $res = $ua->post('${BASE_URL}/sources/upload-branches',
    'Authorization' => 'Bearer <token>',
    'Content-Type' => 'application/json',
    Content => $json->encode($branches_data)
);
print $res->decoded_content;`,
          },
          {
            lang: 'go',
            label: 'Go',
            code: `package main
import (
    "bytes"
    "io/ioutil"
    "net/http"
    "encoding/json"
)

func main() {
    data, _ := ioutil.ReadFile("branches.json")
    var branchesData map[string]interface{}
    json.Unmarshal(data, &branchesData)
    
    jsonData, _ := json.Marshal(branchesData)
    req, _ := http.NewRequest("POST", "${BASE_URL}/sources/upload-branches",
        bytes.NewBuffer(jsonData))
    req.Header.Set("Authorization", "Bearer <token>")
    req.Header.Set("Content-Type", "application/json")
    client := &http.Client{}
    resp, _ := client.Do(req)
    defer resp.Body.Close()
}`,
          },
        ],
        roles: ['source'],
      },
    ],
  },
  {
    id: 'location-requests',
    name: 'Location Requests',
    description: 'Request new locations to be added to the system.',
    endpoints: [
      {
        id: 'location-request-create',
        name: 'Submit Location Request',
        method: 'POST',
        path: '/locations/request',
        description: 'Submit a request for a new location to be added.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        body: [
          { name: 'locationName', required: true, type: 'string', description: 'Location name' },
          { name: 'country', required: true, type: 'string', description: 'Country code' },
          { name: 'city', required: false, type: 'string', description: 'City name' },
          { name: 'address', required: false, type: 'string', description: 'Street address' },
          { name: 'iataCode', required: false, type: 'string', description: 'IATA airport code' },
          { name: 'reason', required: false, type: 'string', description: 'Reason for request' },
        ],
        roles: ['source'],
      },
      {
        id: 'location-requests-list-source',
        name: 'List Own Location Requests',
        method: 'GET',
        path: '/locations/requests',
        description: 'List location requests submitted by the authenticated source.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        query: [
          { name: 'status', required: false, type: 'string', description: 'Filter by status (PENDING, APPROVED, REJECTED)' },
          { name: 'limit', required: false, type: 'number', description: 'Max results (default 25)' },
          { name: 'offset', required: false, type: 'number', description: 'Pagination offset (default 0)' },
        ],
        roles: ['source'],
      },
      {
        id: 'location-requests-get-source',
        name: 'Get Own Location Request',
        method: 'GET',
        path: '/locations/requests/:id',
        description: 'Get location request details by ID.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        roles: ['source'],
      },
      {
        id: 'location-requests-list-admin',
        name: 'List All Location Requests (Admin)',
        method: 'GET',
        path: '/admin/locations/requests',
        description: 'List all location requests (admin only).',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        query: [
          { name: 'sourceId', required: false, type: 'string', description: 'Filter by source ID' },
          { name: 'status', required: false, type: 'string', description: 'Filter by status' },
          { name: 'limit', required: false, type: 'number', description: 'Max results (default 25)' },
          { name: 'offset', required: false, type: 'number', description: 'Pagination offset (default 0)' },
        ],
        roles: ['admin'],
      },
      {
        id: 'location-requests-approve',
        name: 'Approve Location Request',
        method: 'POST',
        path: '/admin/locations/requests/:id/approve',
        description: 'Approve a location request (admin only).',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        body: [
          { name: 'adminNotes', required: false, type: 'string', description: 'Admin notes' },
        ],
        roles: ['admin'],
      },
      {
        id: 'location-requests-reject',
        name: 'Reject Location Request',
        method: 'POST',
        path: '/admin/locations/requests/:id/reject',
        description: 'Reject a location request (admin only).',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        body: [
          { name: 'adminNotes', required: false, type: 'string', description: 'Admin notes' },
        ],
        roles: ['admin'],
      },
    ],
  },
  {
    id: 'coverage',
    name: 'Location Coverage',
    description: 'Manage source location coverage and agreement-specific overrides.',
    endpoints: [
      {
        id: 'coverage-source',
        name: 'Get Source Coverage',
        method: 'GET',
        path: '/coverage/source/:sourceId',
        description: 'View a source\'s location coverage (from last sync).',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        query: [
          { name: 'limit', required: false, type: 'number', description: 'Max results (default 25)' },
          { name: 'cursor', required: false, type: 'string', description: 'Pagination cursor' },
        ],
        roles: ['admin', 'agent', 'source'],
      },
      {
        id: 'coverage-source-sync',
        name: 'Sync Source Coverage',
        method: 'POST',
        path: '/coverage/source/:sourceId/sync',
        description: 'Sync source coverage from supplier adapter (maps to UN/LOCODE). Use your own company ID as sourceId.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        responses: [
          {
            status: 200,
            description: 'Sync completed',
            bodyExample: {
              message: 'Coverage synced successfully',
              sourceId: 'cmi49dpj9000080owwfvew9c8',
              locationsSynced: 12,
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl -X POST "${BASE_URL}/coverage/source/YOUR_COMPANY_ID/sync" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.post(\`\${BASE_URL}/coverage/source/YOUR_COMPANY_ID/sync\`, {}, {
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('POST', '${BASE_URL}/coverage/source/YOUR_COMPANY_ID/sync', [
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['source'],
      },
      {
        id: 'coverage-agreement',
        name: 'Get Agreement Coverage',
        method: 'GET',
        path: '/coverage/agreement/:agreementId',
        description: 'Get effective coverage for an agreement (base source coverage ∪ allow overrides − deny overrides). Returns all locations available for this agreement.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        responses: [
          {
            status: 200,
            description: 'Agreement coverage',
            bodyExample: {
              agreement_id: 'agr_123',
              locations: [
                {
                  unlocode: 'GBMAN',
                  country: 'GB',
                  place: 'Manchester',
                  iataCode: 'MAN',
                  latitude: 53.3656,
                  longitude: -2.2729,
                },
                {
                  unlocode: 'GBGLA',
                  country: 'GB',
                  place: 'Glasgow',
                  iataCode: 'GLA',
                  latitude: 55.8642,
                  longitude: -4.2518,
                },
              ],
              total: 2,
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl "${BASE_URL}/coverage/agreement/agr_123" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.get('${BASE_URL}/coverage/agreement/agr_123', {
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('GET', '${BASE_URL}/coverage/agreement/agr_123', [
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['admin', 'agent', 'source'],
      },
      {
        id: 'coverage-agreement-override',
        name: 'Upsert Agreement Override',
        method: 'POST',
        path: '/coverage/agreement/:agreementId/override',
        description: 'Upsert a per-agreement location override (allow or deny).',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        body: [
          { name: 'unlocode', required: true, type: 'string', description: 'UN/LOCODE' },
          { name: 'allowed', required: true, type: 'boolean', description: 'Allow (true) or deny (false)' },
        ],
        roles: ['admin', 'agent', 'source'],
      },
      {
        id: 'coverage-agreement-override-delete',
        name: 'Remove Agreement Override',
        method: 'DELETE',
        path: '/coverage/agreement/:agreementId/override/:unlocode',
        description: 'Remove a per-agreement location override.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        roles: ['admin', 'agent', 'source'],
      },
    ],
  },
  {
    id: 'source-grpc',
    name: 'Source gRPC Implementation',
    description: 'gRPC service interface that Sources must implement. These are the response formats you must return.',
    endpoints: [
      {
        id: 'grpc-get-availability',
        name: 'GetAvailability (gRPC)',
        method: 'gRPC',
        path: 'SourceProviderService.GetAvailability',
        description: 'Return vehicle availability offers. This is called by the middleware when an agent searches for availability.',
        body: [
          { name: 'agreement_ref', required: true, type: 'string', description: 'Agreement reference' },
          { name: 'pickup_unlocode', required: true, type: 'string', description: 'UN/LOCODE (e.g., "GBMAN")' },
          { name: 'dropoff_unlocode', required: true, type: 'string', description: 'UN/LOCODE (e.g., "GBGLA")' },
          { name: 'pickup_iso', required: false, type: 'string', description: 'ISO-8601 datetime' },
          { name: 'dropoff_iso', required: false, type: 'string', description: 'ISO-8601 datetime' },
          { name: 'driver_age', required: false, type: 'number', description: 'Driver age' },
          { name: 'residency_country', required: false, type: 'string', description: 'ISO-3166 alpha-2' },
          { name: 'vehicle_classes', required: false, type: 'array', description: 'Array of vehicle class codes' },
        ],
        responses: [
          {
            status: 200,
            description: 'Availability offers returned',
            bodyExample: {
              vehicles: [
                {
                  supplier_offer_ref: 'OFFER-1234567890-1',
                  vehicle_class: 'ECMN',
                  make_model: 'Toyota Yaris',
                  currency: 'USD',
                  total_price: 45.99,
                  availability_status: 'AVAILABLE',
                },
                {
                  supplier_offer_ref: 'OFFER-1234567890-2',
                  vehicle_class: 'CDMR',
                  make_model: 'VW Golf',
                  currency: 'USD',
                  total_price: 67.50,
                  availability_status: 'AVAILABLE',
                },
              ],
            },
          },
        ],
        codeSamples: [
          {
            lang: 'node',
            label: 'Node.js Example',
            code: `// In your gRPC server implementation
GetAvailability: (call, cb) => {
  const { pickup_unlocode, dropoff_unlocode, vehicle_classes } = call.request;
  
  const offers = [
    {
      supplier_offer_ref: \`OFFER-\${Date.now()}-1\`,
      vehicle_class: 'ECMN',
      make_model: 'Toyota Yaris',
      currency: 'USD',
      total_price: 45.99,
      availability_status: 'AVAILABLE',
    },
  ];
  
  cb(null, { vehicles: offers });
}`,
          },
        ],
        roles: ['source'],
      },
      {
        id: 'grpc-create-booking',
        name: 'CreateBooking (gRPC)',
        method: 'gRPC',
        path: 'SourceProviderService.CreateBooking',
        description: 'Create a booking. Return your booking reference and status.',
        body: [
          { name: 'agreement_ref', required: true, type: 'string', description: 'Agreement reference' },
          { name: 'supplier_offer_ref', required: true, type: 'string', description: 'Offer reference from availability' },
          { name: 'agent_booking_ref', required: false, type: 'string', description: 'Agent booking reference' },
          { name: 'idempotency_key', required: true, type: 'string', description: 'Idempotency key for duplicate prevention' },
        ],
        responses: [
          {
            status: 200,
            description: 'Booking created',
            bodyExample: {
              supplier_booking_ref: 'BKG-2025-12345',
              status: 'CONFIRMED',
            },
          },
        ],
        roles: ['source'],
      },
      {
        id: 'grpc-get-locations',
        name: 'GetLocations (gRPC)',
        method: 'gRPC',
        path: 'SourceProviderService.GetLocations',
        description: 'Return available locations. Used for location sync.',
        responses: [
          {
            status: 200,
            description: 'Locations returned',
            bodyExample: {
              locations: [
                { unlocode: 'GBMAN', name: 'Manchester Airport' },
                { unlocode: 'GBGLA', name: 'Glasgow Airport' },
              ],
            },
          },
        ],
        roles: ['source'],
      },
      {
        id: 'grpc-modify-booking',
        name: 'ModifyBooking (gRPC)',
        method: 'gRPC',
        path: 'SourceProviderService.ModifyBooking',
        description: 'Modify an existing booking.',
        body: [
          { name: 'agreement_ref', required: true, type: 'string', description: 'Agreement reference' },
          { name: 'supplier_booking_ref', required: true, type: 'string', description: 'Your booking reference' },
        ],
        responses: [
          {
            status: 200,
            description: 'Booking modified',
            bodyExample: {
              supplier_booking_ref: 'BKG-2025-12345',
              status: 'CONFIRMED',
            },
          },
        ],
        roles: ['source'],
      },
      {
        id: 'grpc-cancel-booking',
        name: 'CancelBooking (gRPC)',
        method: 'gRPC',
        path: 'SourceProviderService.CancelBooking',
        description: 'Cancel an existing booking.',
        body: [
          { name: 'agreement_ref', required: true, type: 'string', description: 'Agreement reference' },
          { name: 'supplier_booking_ref', required: true, type: 'string', description: 'Your booking reference' },
        ],
        responses: [
          {
            status: 200,
            description: 'Booking cancelled',
            bodyExample: {
              supplier_booking_ref: 'BKG-2025-12345',
              status: 'CANCELLED',
            },
          },
        ],
        roles: ['source'],
      },
      {
        id: 'grpc-check-booking',
        name: 'CheckBooking (gRPC)',
        method: 'gRPC',
        path: 'SourceProviderService.CheckBooking',
        description: 'Check booking status.',
        body: [
          { name: 'agreement_ref', required: true, type: 'string', description: 'Agreement reference' },
          { name: 'supplier_booking_ref', required: true, type: 'string', description: 'Your booking reference' },
        ],
        responses: [
          {
            status: 200,
            description: 'Booking status returned',
            bodyExample: {
              supplier_booking_ref: 'BKG-2025-12345',
              status: 'CONFIRMED',
            },
          },
        ],
        roles: ['source'],
      },
    ],
  },
  {
    id: 'endpoints',
    name: 'Endpoint Configuration',
    description: 'Configure and manage your HTTP and gRPC endpoints.',
    endpoints: [
      {
        id: 'endpoints-config-get',
        name: 'Get Endpoint Configuration',
        method: 'GET',
        path: '/endpoints/config',
        description: 'Get your current endpoint configuration including HTTP and gRPC endpoints.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        responses: [
          {
            status: 200,
            description: 'Endpoint configuration',
            bodyExample: {
              companyId: 'cmi49dpj9000080owwfvew9c8',
              companyName: 'Example Source',
              type: 'SOURCE',
              httpEndpoint: 'http://localhost:9090',
              grpcEndpoint: 'localhost:51062',
              adapterType: 'grpc',
              status: 'ACTIVE',
              updatedAt: '2025-11-18T09:44:38.906Z',
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl "${BASE_URL}/endpoints/config" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.get('${BASE_URL}/endpoints/config', {
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('GET', '${BASE_URL}/endpoints/config', [
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['source', 'agent'],
      },
      {
        id: 'endpoints-config-update',
        name: 'Update Endpoint Configuration',
        method: 'PUT',
        path: '/endpoints/config',
        description: 'Update your HTTP and gRPC endpoint configuration.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        body: [
          { name: 'httpEndpoint', required: false, type: 'string', description: 'HTTP endpoint URL (e.g., http://localhost:9090)' },
          { name: 'grpcEndpoint', required: false, type: 'string', description: 'gRPC endpoint address (e.g., localhost:51062)' },
          { name: 'adapterType', required: false, type: 'string', description: 'Adapter type: mock, grpc, or http' },
        ],
        responses: [
          {
            status: 200,
            description: 'Configuration updated',
            bodyExample: {
              message: 'Endpoint configuration updated successfully',
              companyId: 'cmi49dpj9000080owwfvew9c8',
              httpEndpoint: 'http://localhost:9090',
              grpcEndpoint: 'localhost:51062',
              adapterType: 'grpc',
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl -X PUT "${BASE_URL}/endpoints/config" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"httpEndpoint":"http://localhost:9090","grpcEndpoint":"localhost:51062"}'`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.put('${BASE_URL}/endpoints/config', {
  httpEndpoint: 'http://localhost:9090',
  grpcEndpoint: 'localhost:51062',
  adapterType: 'grpc'
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
$res = $client->request('PUT', '${BASE_URL}/endpoints/config', [
  'headers' => ['Authorization' => 'Bearer <token>'],
  'json' => [
    'httpEndpoint' => 'http://localhost:9090',
    'grpcEndpoint' => 'localhost:51062',
    'adapterType' => 'grpc',
  ],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['source', 'agent'],
      },
    ],
  },
  {
    id: 'verification',
    name: 'Verification',
    description: 'Run verification tests to validate your source or agent implementation.',
    endpoints: [
      {
        id: 'verification-source-run',
        name: 'Run Source Verification',
        method: 'POST',
        path: '/verification/source/run',
        description: 'Run comprehensive verification tests for your source including connectivity, locations, availability, and booking flow.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        body: [
          { name: 'test_agreement_ref', required: false, type: 'string', description: 'Test agreement reference (optional)' },
        ],
        responses: [
          {
            status: 200,
            description: 'Verification completed',
            bodyExample: {
              company_id: 'cmi49dpj9000080owwfvew9c8',
              kind: 'SOURCE',
              passed: true,
              steps: [
                { name: 'echo', passed: true, detail: 'Adapter connectivity successful' },
                { name: 'locations', passed: true, detail: 'Retrieved 12 locations, 12 valid UN/LOCODEs' },
                { name: 'availability', passed: true, detail: 'Availability test passed' },
                { name: 'booking_flow', passed: true, detail: 'Complete booking flow passed' },
              ],
              created_at: '2025-11-18T15:21:59.945Z',
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl -X POST "${BASE_URL}/verification/source/run" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.post('${BASE_URL}/verification/source/run', {}, {
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('POST', '${BASE_URL}/verification/source/run', [
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['source'],
      },
      {
        id: 'verification-agent-run',
        name: 'Run Agent Verification',
        method: 'POST',
        path: '/verification/agent/run',
        description: 'Run comprehensive verification tests for your agent including booking operations against sandbox environment.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        body: [
          { name: 'source_id', required: false, type: 'string', description: 'Source ID to test against (defaults to sandbox)' },
          { name: 'test_agreement_ref', required: false, type: 'string', description: 'Test agreement reference (optional)' },
        ],
        responses: [
          {
            status: 200,
            description: 'Verification completed',
            bodyExample: {
              company_id: 'cmi49dpj9000080owwfvew9c8',
              kind: 'AGENT',
              passed: true,
              steps: [
                { name: 'booking_flow', passed: true, detail: 'Complete booking flow passed' },
                { name: 'availability', passed: true, detail: 'Availability test passed' },
              ],
              created_at: '2025-11-18T15:21:59.945Z',
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl -X POST "${BASE_URL}/verification/agent/run" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"source_id":"cmi4xxhuf00001uqb3zadk8oo"}'`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.post('${BASE_URL}/verification/agent/run', {
  source_id: 'cmi4xxhuf00001uqb3zadk8oo'
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
$res = $client->request('POST', '${BASE_URL}/verification/agent/run', [
  'headers' => ['Authorization' => 'Bearer <token>'],
  'json' => ['source_id' => 'cmi4xxhuf00001uqb3zadk8oo'],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['agent'],
      },
      {
        id: 'verification-status',
        name: 'Get Verification Status',
        method: 'GET',
        path: '/verification/status',
        description: 'Get the latest verification status and results for your company.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        responses: [
          {
            status: 200,
            description: 'Verification status',
            bodyExample: {
              company_id: 'cmi49dpj9000080owwfvew9c8',
              kind: 'SOURCE',
              passed: true,
              steps: [
                { name: 'echo', passed: true, detail: 'Adapter connectivity successful' },
                { name: 'locations', passed: true, detail: 'Retrieved 12 locations' },
              ],
              created_at: '2025-11-18T15:21:59.945Z',
            },
          },
          {
            status: 404,
            description: 'No verification found',
            bodyExample: {
              company_id: 'cmi49dpj9000080owwfvew9c8',
              kind: '',
              passed: false,
              steps: [],
              created_at: '',
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl "${BASE_URL}/verification/status" \\
  -H "Authorization: Bearer <token>"`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.get('${BASE_URL}/verification/status', {
  headers: { Authorization: 'Bearer <token>' }
});
console.log(res.data);`,
          },
          {
            lang: 'php',
            label: 'PHP',
            code: `<?php
$client = new \\GuzzleHttp\\Client();
$res = $client->request('GET', '${BASE_URL}/verification/status', [
  'headers' => ['Authorization' => 'Bearer <token>'],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['source', 'agent'],
      },
    ],
  },
  {
    id: 'testing',
    name: 'Testing',
    description: 'Test your gRPC connectivity and endpoints.',
    endpoints: [
      {
        id: 'test-source-grpc',
        name: 'Test Source gRPC Connection',
        method: 'POST',
        path: '/test/source-grpc',
        description: 'Test connectivity to your gRPC endpoint and validate specific gRPC service methods.',
        headers: [{ name: 'Authorization', required: true, description: 'Bearer <token>' }],
        body: [
          { name: 'addr', required: true, type: 'string', description: 'gRPC address to test (e.g., localhost:51062)' },
          { name: 'grpcEndpoints', required: false, type: 'object', description: 'Specific endpoints to test (health, locations, availability, bookings)' },
        ],
        responses: [
          {
            status: 200,
            description: 'Test results',
            bodyExample: {
              ok: true,
              addr: 'localhost:51062',
              totalMs: 45,
              endpoints: {
                health: { ok: true, ms: 12 },
                locations: { ok: true, ms: 15 },
                availability: { ok: true, ms: 18 },
              },
              tested: ['health', 'locations', 'availability'],
            },
          },
        ],
        codeSamples: [
          {
            lang: 'curl',
            label: 'cURL',
            code: `curl -X POST "${BASE_URL}/test/source-grpc" \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"addr":"localhost:51062"}'`,
          },
          {
            lang: 'node',
            label: 'Node.js',
            code: `import axios from 'axios';
const res = await axios.post('${BASE_URL}/test/source-grpc', {
  addr: 'localhost:51062',
  grpcEndpoints: {
    health: true,
    locations: true,
    availability: true,
  }
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
$res = $client->request('POST', '${BASE_URL}/test/source-grpc', [
  'headers' => ['Authorization' => 'Bearer <token>'],
  'json' => [
    'addr' => 'localhost:51062',
    'grpcEndpoints' => [
      'health' => true,
      'locations' => true,
    ],
  ],
]);
echo $res->getBody();`,
          },
        ],
        roles: ['source'],
      },
    ],
  },
];
