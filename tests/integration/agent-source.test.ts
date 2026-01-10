import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8080';

interface TestUser {
  email: string;
  password: string;
  token?: string;
  companyId?: string;
}

describe('Agent-Source Integration Tests', () => {
  let agent: TestUser;
  let source: TestUser;
  let agreementRef: string;

  beforeAll(async () => {
    // Setup test users (assuming they exist from seed script)
    agent = {
      email: 'agent1@test.com',
      password: 'agent123',
    };

    source = {
      email: 'source1@test.com',
      password: 'source123',
    };

    // Login agent
    const agentLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: agent.email,
      password: agent.password,
    });
    agent.token = agentLogin.data.token;
    agent.companyId = agentLogin.data.companyId;

    // Login source
    const sourceLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: source.email,
      password: source.password,
    });
    source.token = sourceLogin.data.token;
    source.companyId = sourceLogin.data.companyId;

    agreementRef = 'TEST-AGR-001';
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Availability Flow', () => {
    it('should submit availability request and receive request_id', async () => {
      const response = await axios.post(
        `${BASE_URL}/availability/submit`,
        {
          pickup_unlocode: 'GBMAN',
          dropoff_unlocode: 'GBGLA',
          pickup_iso: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          dropoff_iso: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          driver_age: 30,
          residency_country: 'US',
          agreement_refs: [agreementRef],
        },
        {
          headers: {
            Authorization: `Bearer ${agent.token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('request_id');
      expect(response.data).toHaveProperty('expected_sources');
    });

    it('should poll availability results', async () => {
      // First submit
      const submitResponse = await axios.post(
        `${BASE_URL}/availability/submit`,
        {
          pickup_unlocode: 'GBMAN',
          dropoff_unlocode: 'GBGLA',
          pickup_iso: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          dropoff_iso: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          driver_age: 30,
          residency_country: 'US',
          agreement_refs: [agreementRef],
        },
        {
          headers: {
            Authorization: `Bearer ${agent.token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const requestId = submitResponse.data.request_id;

      // Poll
      const pollResponse = await axios.get(`${BASE_URL}/availability/poll`, {
        params: {
          request_id: requestId,
          since_seq: 0,
          wait_ms: 1000,
        },
        headers: {
          Authorization: `Bearer ${agent.token}`,
        },
      });

      expect(pollResponse.status).toBe(200);
      expect(pollResponse.data).toHaveProperty('complete');
      expect(pollResponse.data).toHaveProperty('last_seq');
    });
  });

  describe('Booking Flow', () => {
    it('should create booking with idempotency key', async () => {
      const idempotencyKey = `test-${Date.now()}`;
      const response = await axios.post(
        `${BASE_URL}/bookings`,
        {
          agreement_ref: agreementRef,
          supplier_offer_ref: 'TEST-OFFER-001',
          agent_booking_ref: 'TEST-BOOKING-001',
        },
        {
          headers: {
            Authorization: `Bearer ${agent.token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('supplier_booking_ref');
    });

    it('should check booking status', async () => {
      // First create a booking
      const idempotencyKey = `test-check-${Date.now()}`;
      const createResponse = await axios.post(
        `${BASE_URL}/bookings`,
        {
          agreement_ref: agreementRef,
          supplier_offer_ref: 'TEST-OFFER-002',
        },
        {
          headers: {
            Authorization: `Bearer ${agent.token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
        }
      );

      const supplierBookingRef = createResponse.data.supplier_booking_ref;

      // Check booking
      const checkResponse = await axios.get(
        `${BASE_URL}/bookings/${supplierBookingRef}`,
        {
          params: {
            agreement_ref: agreementRef,
          },
          headers: {
            Authorization: `Bearer ${agent.token}`,
          },
        }
      );

      expect(checkResponse.status).toBe(200);
      expect(checkResponse.data).toHaveProperty('status');
    });

    it('should cancel booking', async () => {
      // First create a booking
      const idempotencyKey = `test-cancel-${Date.now()}`;
      const createResponse = await axios.post(
        `${BASE_URL}/bookings`,
        {
          agreement_ref: agreementRef,
          supplier_offer_ref: 'TEST-OFFER-003',
        },
        {
          headers: {
            Authorization: `Bearer ${agent.token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
        }
      );

      const supplierBookingRef = createResponse.data.supplier_booking_ref;

      // Cancel booking
      const cancelResponse = await axios.post(
        `${BASE_URL}/bookings/${supplierBookingRef}/cancel`,
        {},
        {
          params: {
            agreement_ref: agreementRef,
          },
          headers: {
            Authorization: `Bearer ${agent.token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      expect(cancelResponse.status).toBe(200);
      expect(cancelResponse.data).toHaveProperty('status');
    });
  });

  describe('Agreement Flow', () => {
    it('should list agreements for agent', async () => {
      const response = await axios.get(`${BASE_URL}/agreements`, {
        headers: {
          Authorization: `Bearer ${agent.token}`,
        },
      });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });
  });
});

