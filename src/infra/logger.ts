import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const level = process.env.LOG_LEVEL || (isProduction ? "info" : "debug");

// Simple logger configuration without transport for now
export const logger = pino({
  // [AUTO-AUDIT] Honor LOG_LEVEL env
  level,
  formatters: {
    level: (label) => {
      return { level: label };
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime
});




