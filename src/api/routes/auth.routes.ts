import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../data/prisma.js";
import { Auth } from "../../infra/auth.js";
import { EmailVerificationService } from "../../services/emailVerification.js";
import { PasswordResetService } from "../../services/passwordReset.js";
import { requireAuth } from "../../infra/auth.js";

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
        approvalStatus: "PENDING", // Explicitly set to PENDING - requires admin approval
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
    let emailSent = false;
    let emailError: string | null = null;
    try {
      const otp = await EmailVerificationService.sendOTPEmail(body.email, body.companyName);
      emailSent = true;
      console.log(`✅ Registration successful for ${body.email}, OTP sent: ${otp}`);
    } catch (emailErr: any) {
      emailSent = false;
      emailError = emailErr.message || "Unknown error";
      console.error(`❌ Registration succeeded but failed to send OTP email to ${body.email}:`, emailErr);
      // Registration still succeeds, but user will need to resend OTP
    }

    // Return response with email status
    // NEVER include OTP in API response for security reasons
    const response: any = {
      message: emailSent 
        ? "Registration successful! Please check your email for verification code."
        : "Registration successful! However, we couldn't send the verification email. Please use the resend OTP feature or check the server console (development mode only).",
      email: body.email,
      companyName: body.companyName,
      status: "PENDING_VERIFICATION",
      emailSent,
    };
    
    // Log OTP to console in development mode only (never in API response)
    if (!emailSent && process.env.NODE_ENV !== 'production') {
      const company = await prisma.company.findUnique({
        where: { email: body.email },
        select: { emailOtp: true },
      });
      if (company?.emailOtp) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔑 REGISTRATION OTP FOR ${body.email}: ${company.emailOtp}`);
        console.log(`⚠️  Email sending failed - OTP shown in console for development only`);
        console.log(`${'='.repeat(80)}\n`);
      }
    }
    
    res.json(response);
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
// Handle OPTIONS preflight for verify-email route
authRouter.options("/auth/verify-email", (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(204).end();
});

authRouter.post("/auth/verify-email", async (req, res, next) => {
  // Explicitly set CORS headers for this route
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Expose-Headers', '*');
  
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
        approvalStatus: user.company.approvalStatus,
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

    let emailSent = false;
    let emailError: string | null = null;
    let otp: string | null = null;

    try {
      otp = await EmailVerificationService.resendOTP(email);
      emailSent = true;
      console.log(`✅ Resend OTP successful for ${email}, OTP sent: ${otp}`);
    } catch (emailErr: any) {
      emailSent = false;
      // Extract detailed error message
      const errorMsg = emailErr.message || "Unknown error";
      const errorCode = emailErr.code || emailErr.responseCode || 'N/A';
      emailError = errorMsg;
      console.error(`❌ Resend OTP: Failed to send email to ${email}:`, {
        message: errorMsg,
        code: errorCode,
        response: emailErr.response,
        command: emailErr.command,
        responseCode: emailErr.responseCode
      });
      
      // Check if OTP was generated but email failed
      const company = await prisma.company.findUnique({
        where: { email },
        select: { emailOtp: true, emailVerified: true },
      });

      if (company && !company.emailVerified && company.emailOtp) {
        otp = company.emailOtp;
        console.log(`⚠️  OTP generated but email failed. OTP: ${otp}`);
      } else if (emailErr.message.includes("Company not found")) {
        return res.status(404).json({
          error: "COMPANY_NOT_FOUND",
          message: "Company not found"
        });
      } else if (emailErr.message.includes("Email already verified")) {
        return res.status(400).json({
          error: "EMAIL_ALREADY_VERIFIED",
          message: "Email is already verified"
        });
      }
    }

    // Check SMTP configuration status for better error messages
    const smtpConfig = await prisma.smtpConfig.findFirst({
      where: { enabled: true },
      orderBy: { updatedAt: 'desc' },
    });
    const hasEnvVars = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
    const isSmtpConfigured = !!smtpConfig || hasEnvVars;
    const configSource = smtpConfig ? 'admin_panel' : (hasEnvVars ? 'environment_variables' : 'none');
    
    // Determine the specific issue
    let errorType = 'unknown';
    let errorDetails = '';
    
    if (!isSmtpConfigured) {
      errorType = 'not_configured';
      errorDetails = 'SMTP is not configured. No admin config found and environment variables are missing.';
    } else if (emailError) {
      if (emailError.includes('Authentication') || emailError.includes('BadCredentials') || emailError.includes('Username and Password not accepted')) {
        errorType = 'auth_failed';
        errorDetails = 'SMTP credentials are incorrect. For Gmail, use an App Password (not your regular password).';
      } else if (emailError.includes('SMTP')) {
        errorType = 'smtp_error';
        errorDetails = `SMTP error: ${emailError}`;
      } else {
        errorType = 'send_failed';
        errorDetails = emailError;
      }
    }
    
    // Return response with email status
    // NEVER include OTP in API response for security reasons
    const response: any = {
      message: emailSent 
        ? "OTP email sent successfully! Please check your email."
        : errorType === 'not_configured'
          ? "OTP was generated but email sending failed. SMTP is not configured. Please configure SMTP to receive emails."
          : "OTP was generated but email sending failed. Please check your SMTP configuration.",
      email,
      emailSent,
      smtpConfigured: isSmtpConfigured,
      configSource,
      errorType,
      errorDetails: !emailSent ? errorDetails : undefined,
      help: !emailSent ? {
        configureViaAdmin: "POST /admin/smtp with your SMTP credentials",
        configureViaEnv: "Set EMAIL_HOST, EMAIL_USER, EMAIL_PASS in .env file (no quotes around values)",
        gmailHelp: "For Gmail: Enable 2-Step Verification and use App Password from https://myaccount.google.com/apppasswords",
        checkConsole: "In development mode, check server console for OTP and detailed error logs",
        note: configSource === 'admin_panel' 
          ? "⚠️ Admin panel config is active and overrides .env variables. To use .env, disable admin config."
          : configSource === 'environment_variables'
          ? "Using .env variables. Make sure values have NO quotes: EMAIL_PASS=obmfugyywnvxctez (not EMAIL_PASS=\"obmfugyywnvxctez\")"
          : "No SMTP configuration found. Configure via admin panel or .env file."
      } : undefined
    };

    // Log OTP to console in development mode only (never in API response)
    if (!emailSent && otp) {
      const isDev = process.env.NODE_ENV !== 'production';
      if (isDev) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔑 OTP FOR ${email}: ${otp}`);
        console.log(`⚠️  Email sending failed - OTP shown in console for development only`);
        console.log(`${'='.repeat(80)}\n`);
      } else {
        console.error(`❌ Email sending failed for ${email}. OTP was generated but not sent.`);
        console.error(`   Please check SMTP configuration in admin panel or environment variables.`);
      }
    }

    // If email failed, return 200 with warning, not 500
    if (!emailSent) {
      return res.status(200).json(response);
    }

    res.json(response);
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
    
    try {
      const user = await prisma.user.findUnique({
        where: { email: body.email },
        include: { company: true },
      });
      
      if (!user) {
        return res.status(401).json({ error: "AUTH_ERROR", message: "Invalid credentials" });
      }
      
      if (!user.company) {
        return res.status(500).json({
          error: "INTERNAL_ERROR",
          message: "User company not found"
        });
      }

      const ok = await Auth.compare(body.password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ error: "AUTH_ERROR", message: "Invalid credentials" });
      }

      // Check if email is verified
      if (!user.company.emailVerified) {
        return res.status(403).json({
          error: "EMAIL_NOT_VERIFIED",
          message: "Please verify your email address before logging in",
          email: user.email,
          status: "PENDING_VERIFICATION"
        });
      }

      // Check if company is approved by admin
      if (user.company.approvalStatus !== "APPROVED") {
        return res.status(403).json({
          error: "NOT_APPROVED",
          message: user.company.approvalStatus === "PENDING" 
            ? "Your account is pending admin approval. Please wait for approval before accessing the dashboard."
            : "Your account has been rejected. Please contact support for assistance.",
          email: user.email,
          approvalStatus: user.company.approvalStatus,
          status: user.company.status
        });
      }

      // Check if company status is ACTIVE
      if (user.company.status !== "ACTIVE") {
        return res.status(403).json({
          error: "ACCOUNT_NOT_ACTIVE",
          message: "Your account is not active. Please contact support for assistance.",
          email: user.email,
          status: user.company.status
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
        companyId: user.companyId,
        company: {
          id: user.company.id,
          companyName: user.company.companyName,
          type: user.company.type,
          status: user.company.status,
          approvalStatus: user.company.approvalStatus,
          adapterType: user.company.adapterType || null,
          grpcEndpoint: user.company.grpcEndpoint || null,
          httpEndpoint: user.company.httpEndpoint || null,
        },
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      return res.json({ 
        token: access,
        access,
        refresh, 
        user: userData,
        companyId: user.companyId
      });
    } catch (dbError: any) {
      console.error("Database error in login:", dbError);
      
      // Check for database authentication errors
      const errorMessage = dbError?.message || '';
      if (errorMessage.includes('Access denied') || 
          errorMessage.includes('ERROR 28000') || 
          errorMessage.includes('ERROR 1698')) {
        return res.status(503).json({
          error: "DATABASE_AUTH_ERROR",
          message: "Database connection error. Please contact the administrator.",
          hint: "The server cannot connect to the database. This is a server configuration issue."
        });
      }
      
      // Check for missing DATABASE_URL
      if (errorMessage.includes('DATABASE_URL') || errorMessage.includes('Environment variable not found')) {
        return res.status(503).json({
          error: "DATABASE_CONFIG_ERROR",
          message: "Database configuration error. Please contact the administrator.",
          hint: "The server database configuration is missing or incorrect."
        });
      }
      
      // Generic database error
      return res.status(500).json({
        error: "DATABASE_ERROR",
        message: "Database operation failed. Please try again later.",
        hint: "If this problem persists, please contact support."
      });
    }
  } catch (e: any) {
    console.error("Login error:", e);
    if (e.name === "ZodError") {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: e.errors
      });
    }
    // Ensure we always send a response
    if (!res.headersSent) {
      return res.status(500).json({
        error: "INTERNAL_ERROR",
        message: e.message || "An unexpected error occurred"
      });
    } else {
      // If headers already sent, pass to error handler
      next(e);
    }
  }
});

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user info
 *     description: Returns the current authenticated user's information
 *     security:
 *       - bearerAuth: []
 */
authRouter.get("/auth/me", requireAuth(), async (req: any, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      include: { company: true }
    });

    if (!user || !user.company) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
        message: "User not found"
      });
    }

    const userData = {
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      company: {
        id: user.company.id,
        companyName: user.company.companyName,
        type: user.company.type,
        status: user.company.status,
        adapterType: user.company.adapterType || null,
        grpcEndpoint: user.company.grpcEndpoint || null,
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.json(userData);
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request password reset
 *     description: |
 *       Request a password reset by email. Sends an OTP to the user's email address.
 */
authRouter.post("/auth/forgot-password", async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        error: "MISSING_EMAIL",
        message: "Email is required"
      });
    }

    let emailSent = false;
    let emailError: string | null = null;
    let otp: string | null = null;

    try {
      otp = await PasswordResetService.sendResetOTP(email);
      emailSent = true;
      console.log(`✅ Password reset OTP sent to ${email}`);
    } catch (emailErr: any) {
      emailSent = false;
      emailError = emailErr.message || "Unknown error";
      console.error(`❌ Failed to send password reset OTP to ${email}:`, emailErr);
      
      // Check for specific error cases
      if (emailErr.message.includes("User not found")) {
        // Don't reveal if user exists or not for security
        // Return success message even if user doesn't exist
        return res.status(200).json({
          message: "If an account with that email exists, a password reset code has been sent.",
          emailSent: false, // Actually false, but we don't reveal this
        });
      } else if (emailErr.message.includes("Email not verified")) {
        return res.status(400).json({
          error: "EMAIL_NOT_VERIFIED",
          message: "Please verify your email address before resetting your password",
        });
      }
    }

    // Check SMTP configuration status
    const smtpConfig = await prisma.smtpConfig.findFirst({
      where: { enabled: true },
      orderBy: { updatedAt: 'desc' },
    });
    const hasEnvVars = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
    const isSmtpConfigured = !!smtpConfig || hasEnvVars;
    const configSource = smtpConfig ? 'admin_panel' : (hasEnvVars ? 'environment_variables' : 'none');
    
    // Log OTP to console in development mode only
    if (!emailSent && otp && process.env.NODE_ENV !== 'production') {
      const company = await prisma.company.findUnique({
        where: { email },
        select: { emailOtp: true },
      });
      if (company?.emailOtp) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔑 PASSWORD RESET OTP FOR ${email}: ${company.emailOtp}`);
        console.log(`⚠️  Email sending failed - OTP shown in console for development only`);
        console.log(`${'='.repeat(80)}\n`);
      }
    }

    const response: any = {
      message: emailSent 
        ? "Password reset code sent successfully! Please check your email."
        : "Password reset code was generated but email sending failed. Please check your SMTP configuration. In development mode, check the server console for the OTP.",
      email,
      emailSent,
      smtpConfigured: isSmtpConfigured,
      configSource,
    };

    res.status(200).json(response);
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /auth/verify-reset-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify password reset OTP
 *     description: |
 *       Verify the OTP code sent for password reset.
 */
const verifyResetOTPSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(4),
});

authRouter.post("/auth/verify-reset-otp", async (req, res, next) => {
  try {
    const body = verifyResetOTPSchema.parse(req.body);
    
    const isValid = await PasswordResetService.verifyResetOTP(body.email, body.otp);
    
    if (!isValid) {
      return res.status(400).json({
        error: "INVALID_OTP",
        message: "Invalid or expired OTP code"
      });
    }

    res.json({
      message: "OTP verified successfully. You can now reset your password.",
      verified: true,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password
 *     description: |
 *       Reset password using verified OTP code.
 */
const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(4),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

authRouter.post("/auth/reset-password", async (req, res, next) => {
  try {
    const body = resetPasswordSchema.parse(req.body);
    
    const success = await PasswordResetService.resetPassword(
      body.email,
      body.otp,
      body.newPassword
    );
    
    if (!success) {
      return res.status(400).json({
        error: "INVALID_OTP",
        message: "Invalid or expired OTP code"
      });
    }

    res.json({
      message: "Password reset successfully! You can now login with your new password.",
    });
  } catch (e) {
    next(e);
  }
});
