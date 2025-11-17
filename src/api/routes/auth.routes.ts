import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../data/prisma.js";
import { Auth } from "../../infra/auth.js";
import { EmailVerificationService } from "../../services/emailVerification.js";

export const authRouter = Router();

const registerSchema = z.object({
  companyName: z.string().min(2),
  type: z.enum(["AGENT", "SOURCE"]),
  email: z.string().email(),
  password: z.string().min(6),
});

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a company (AGENT or SOURCE)
 *     description: |
 *       Register endpoint that creates a new company and user, then sends an OTP email for verification.
 *       User must verify email before they can login.
 */
authRouter.post("/auth/register", async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const exists = await prisma.company.findUnique({
      where: { email: body.email },
    });
    if (exists)
      return res
        .status(409)
        .json({ error: "CONFLICT", message: "Email already exists" });
    
    const passwordHash = await Auth.hash(body.password);
    const company = await prisma.company.create({
      data: {
        companyName: body.companyName,
        type: body.type,
        email: body.email,
        passwordHash,
        status: "PENDING_VERIFICATION", // Keep as pending until email verified
      },
    });
    
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        email: body.email,
        passwordHash,
        role: body.type === "AGENT" ? "AGENT_USER" : "SOURCE_USER",
      },
    });

    // Send OTP email
    await EmailVerificationService.sendOTPEmail(body.email, body.companyName);

    res.json({
      message: "Registration successful! Please check your email for verification code.",
      email: body.email,
      companyName: body.companyName,
      status: "PENDING_VERIFICATION"
    });
  } catch (e) {
    next(e);
  }
});

const verifyEmailSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(4),
});

/**
 * @openapi
 * /auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email with OTP
 *     description: |
 *       Verify email address using the OTP code sent during registration.
 *       Returns JWT tokens upon successful verification.
 */
authRouter.post("/auth/verify-email", async (req, res, next) => {
  try {
    const body = verifyEmailSchema.parse(req.body);
    
    const isValid = await EmailVerificationService.verifyOTP(body.email, body.otp);
    
    if (!isValid) {
      return res.status(400).json({
        error: "INVALID_OTP",
        message: "Invalid or expired OTP code"
      });
    }

    // Get user and company data after verification
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { company: true },
    });

    if (!user) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
        message: "User not found"
      });
    }

    const access = Auth.signAccess({
      sub: user.id,
      companyId: user.companyId,
      role: user.role,
      type: user.company.type,
    });
    const refresh = Auth.signRefresh({ sub: user.id });

    // Return complete user data (excluding sensitive fields)
    const userData = {
      id: user.id,
      email: user.email,
      role: user.role,
      company: {
        id: user.company.id,
        companyName: user.company.companyName,
        type: user.company.type,
        status: user.company.status,
        adapterType: user.company.adapterType,
        grpcEndpoint: user.company.grpcEndpoint,
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.json({
      message: "Email verified successfully!",
      access,
      refresh,
      user: userData
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /auth/resend-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Resend OTP email
 *     description: |
 *       Resend OTP email for email verification.
 */
authRouter.post("/auth/resend-otp", async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        error: "MISSING_EMAIL",
        message: "Email is required"
      });
    }

    await EmailVerificationService.resendOTP(email);

    res.json({
      message: "OTP email sent successfully!",
      email
    });
  } catch (e: any) {
    if (e.message === "Company not found") {
      return res.status(404).json({
        error: "COMPANY_NOT_FOUND",
        message: "Company not found"
      });
    }
    if (e.message === "Email already verified") {
      return res.status(400).json({
        error: "ALREADY_VERIFIED",
        message: "Email already verified"
      });
    }
    next(e);
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login
 *     description: |
 *       Login endpoint that returns JWT tokens and complete user profile data.
 *       Response includes access/refresh tokens and full user information including company details.
 */
authRouter.post("/auth/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { company: true },
    });
    if (!user)
      return res
        .status(401)
        .json({ error: "AUTH_ERROR", message: "Invalid credentials" });
    
    const ok = await Auth.compare(body.password, user.passwordHash);
    if (!ok)
      return res
        .status(401)
        .json({ error: "AUTH_ERROR", message: "Invalid credentials" });

    // Check if email is verified
    if (!user.company.emailVerified) {
      return res.status(403).json({
        error: "EMAIL_NOT_VERIFIED",
        message: "Please verify your email address before logging in",
        email: user.email,
        status: "PENDING_VERIFICATION"
      });
    }

    const access = Auth.signAccess({
      sub: user.id,
      companyId: user.companyId,
      role: user.role,
      type: user.company.type,
    });
    const refresh = Auth.signRefresh({ sub: user.id });

    // Return complete user data (excluding sensitive fields)
    const userData = {
      id: user.id,
      email: user.email,
      role: user.role,
      company: {
        id: user.company.id,
        companyName: user.company.companyName,
        type: user.company.type,
        status: user.company.status,
        adapterType: user.company.adapterType,
        grpcEndpoint: user.company.grpcEndpoint,
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.json({ access, refresh, user: userData });
  } catch (e) {
    next(e);
  }
});
