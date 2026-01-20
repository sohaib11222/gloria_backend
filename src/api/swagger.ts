import swaggerJsdoc from "swagger-jsdoc";
import { Express } from "express";
import swaggerUi from "swagger-ui-express";

export function mountSwagger(app: Express) {
  const spec = swaggerJsdoc({
    definition: {
      openapi: "3.0.0",
      info: { 
        title: "Car Hire Middleware API", 
        version: "0.1.0",
        description: "Partner-facing middleware for car rental: Agents (OTAs) search availability and create bookings with Sources (suppliers)"
      },
      servers: [{ url: "http://localhost:" + (process.env.PORT || 8080) }],
      tags: [
        {
          name: 'Auth',
          description: 'Authentication and authorization'
        },
        {
          name: 'Availability',
          description: 'Car rental availability search and polling'
        },
        {
          name: 'Bookings',
          description: 'Car rental booking management'
        },
        {
          name: 'Agreements',
          description: 'Business agreements between agents and sources'
        },
        {
          name: 'Locations',
          description: 'Location search and coverage management'
        },
        {
          name: 'Verification',
          description: 'Automated verification flows for Agents and Sources'
        },
        {
          name: 'Admin',
          description: 'Administrative functions and system management'
        },
        {
          name: 'Admin Health',
          description: 'Manage source health and exclusions'
        }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT token for authentication'
          }
        }
      }
    },
    apis: ["./src/api/routes/*.ts"]
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec)); // Also mount at /api/docs for frontend
}




