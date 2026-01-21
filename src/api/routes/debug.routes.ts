import { Router, Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../../infra/logger.js";

const execAsync = promisify(exec);

export const debugRouter = Router();

// Helper function to get PM2 logs
async function getPm2Logs(lines: number = 50): Promise<string> {
  try {
    // Get PM2 process info using pm2 jlist
    const { stdout: pm2List } = await execAsync("pm2 jlist");
    const processes = JSON.parse(pm2List);
    const backendProcess = processes.find((p: any) => p.name === "gloria-backend");
    
    if (!backendProcess) {
      // Try default log path
      try {
        const { stdout } = await execAsync(`tail -n ${lines} /root/.pm2/logs/gloria-backend-out.log 2>/dev/null || tail -n ${lines} ~/.pm2/logs/gloria-backend-out.log 2>/dev/null || echo "Log file not found"`);
        return stdout || "No logs available";
      } catch {
        return "PM2 process 'gloria-backend' not found and default log path not accessible";
      }
    }

    const logPath = backendProcess.pm2_env?.pm_out_log_path || backendProcess.pm2_env?.pm_log_path || "";
    if (!logPath) {
      // Try default log paths
      try {
        const { stdout } = await execAsync(`tail -n ${lines} /root/.pm2/logs/gloria-backend-out.log 2>/dev/null || tail -n ${lines} ~/.pm2/logs/gloria-backend-out.log 2>/dev/null || echo "Log file not found"`);
        return stdout || "No logs available";
      } catch {
        return "No log path found in PM2 and default paths not accessible";
      }
    }

    const { stdout } = await execAsync(`tail -n ${lines} "${logPath}"`);
    return stdout || "No logs available";
  } catch (error: any) {
    return `Error reading logs: ${error.message}`;
  }
}

// Helper function to get PM2 error logs
async function getPm2ErrorLogs(lines: number = 50): Promise<string> {
  try {
    // Get PM2 process info using pm2 jlist
    const { stdout: pm2List } = await execAsync("pm2 jlist");
    const processes = JSON.parse(pm2List);
    const backendProcess = processes.find((p: any) => p.name === "gloria-backend");
    
    if (!backendProcess) {
      // Try default error log path
      try {
        const { stdout } = await execAsync(`tail -n ${lines} /root/.pm2/logs/gloria-backend-error.log 2>/dev/null || tail -n ${lines} ~/.pm2/logs/gloria-backend-error.log 2>/dev/null || echo "Error log file not found"`);
        return stdout || "No error logs available";
      } catch {
        return "PM2 process 'gloria-backend' not found and default error log path not accessible";
      }
    }

    const errorLogPath = backendProcess.pm2_env?.pm_err_log_path || "";
    if (!errorLogPath) {
      // Try default error log paths
      try {
        const { stdout } = await execAsync(`tail -n ${lines} /root/.pm2/logs/gloria-backend-error.log 2>/dev/null || tail -n ${lines} ~/.pm2/logs/gloria-backend-error.log 2>/dev/null || echo "Error log file not found"`);
        return stdout || "No error logs available";
      } catch {
        return "No error log path found in PM2 and default paths not accessible";
      }
    }

    const { stdout } = await execAsync(`tail -n ${lines} "${errorLogPath}"`);
    return stdout || "No error logs available";
  } catch (error: any) {
    return `Error reading error logs: ${error.message}`;
  }
}

// Main debug endpoint - accessible from browser
debugRouter.get("/api/debug", async (req: Request, res: Response) => {
  // CRITICAL: Set CORS headers to allow browser access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Expose-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.removeHeader('Vary');

  try {
    const lines = parseInt(req.query.lines as string) || 50;
    const includeErrors = req.query.errors === 'true';

    // Get current request information - ALL headers for debugging
    const allHeaders: any = {};
    Object.keys(req.headers).forEach(key => {
      allHeaders[key] = req.headers[key] || 'Not set';
    });

    const requestInfo = {
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      headers: {
        origin: req.headers.origin || 'Not set',
        referer: req.headers.referer || 'Not set',
        'user-agent': req.headers['user-agent'] || 'Not set',
        'content-type': req.headers['content-type'] || 'Not set',
        'access-control-request-method': req.headers['access-control-request-method'] || 'Not set',
        'access-control-request-headers': req.headers['access-control-request-headers'] || 'Not set',
        host: req.headers.host || 'Not set',
        'x-forwarded-for': req.headers['x-forwarded-for'] || 'Not set',
        'x-real-ip': req.headers['x-real-ip'] || 'Not set',
        // Show ALL headers for debugging
        allHeaders: allHeaders,
      },
      ip: req.ip,
      ips: req.ips,
      protocol: req.protocol,
      secure: req.secure,
      timestamp: new Date().toISOString(),
      body: req.method === 'POST' ? 'Body present (check Network tab for details)' : 'N/A',
    };

    // Get PM2 process status
    let pm2Status: any = "Unknown";
    try {
      const { stdout } = await execAsync("pm2 jlist");
      const processes = JSON.parse(stdout);
      const backendProcess = processes.find((p: any) => p.name === "gloria-backend");
      if (backendProcess) {
        pm2Status = {
          name: backendProcess.name,
          status: backendProcess.pm2_env?.status || "unknown",
          uptime: backendProcess.pm2_env?.pm_uptime || 0,
          restarts: backendProcess.pm2_env?.restart_time || 0,
          memory: backendProcess.monit?.memory || 0,
          cpu: backendProcess.monit?.cpu || 0,
        };
      }
    } catch (error: any) {
      pm2Status = `Error: ${error.message}`;
    }

    // Get server logs
    const serverLogs = await getPm2Logs(lines);
    const errorLogs = includeErrors ? await getPm2ErrorLogs(lines) : "Not requested (add ?errors=true)";

    // Get Nginx status
    let nginxStatus = "Unknown";
    try {
      await execAsync("systemctl is-active nginx");
      nginxStatus = "Active";
    } catch {
      nginxStatus = "Inactive or error";
    }

    // Get system info
    let systemInfo = {};
    try {
      const { stdout: uptime } = await execAsync("uptime");
      const { stdout: memory } = await execAsync("free -h");
      systemInfo = {
        uptime: uptime.trim(),
        memory: memory.trim().split('\n'),
      };
    } catch (error: any) {
      systemInfo = { error: error.message };
    }

    // CORS configuration check
    const corsConfig = {
      middleware: "First middleware (before all others)",
      allowOrigin: "*",
      allowMethods: "*",
      allowHeaders: "*",
      allowCredentials: false,
      exposeHeaders: "*",
      maxAge: 86400,
      varyHeader: "Removed",
    };

    // Response headers that were set
    const responseHeaders = {
      'Access-Control-Allow-Origin': res.getHeader('Access-Control-Allow-Origin'),
      'Access-Control-Allow-Methods': res.getHeader('Access-Control-Allow-Methods'),
      'Access-Control-Allow-Headers': res.getHeader('Access-Control-Allow-Headers'),
      'Content-Type': res.getHeader('Content-Type'),
    };

    const debugInfo = {
      timestamp: new Date().toISOString(),
      server: {
        status: "Running",
        pm2: pm2Status,
        nginx: nginxStatus,
        system: systemInfo,
      },
      request: requestInfo,
      cors: {
        configuration: corsConfig,
        responseHeaders: responseHeaders,
        note: "CORS is completely open - all origins, methods, and headers allowed",
      },
      logs: {
        server: serverLogs.split('\n').slice(-lines),
        errors: includeErrors ? errorLogs.split('\n').slice(-lines) : "Add ?errors=true to include error logs",
        lines: lines,
      },
      troubleshooting: {
        commonIssues: [
          "If CORS error persists: Clear browser cache (Ctrl+Shift+R)",
          "If no response: Check browser Network tab for actual error",
          "If ERR_NETWORK: Check if request reaches server (see logs above)",
          "If 404: Verify route path matches exactly",
          "If 500: Check error logs above",
          "If Origin is 'Not set': Browser may not be sending Origin header (normal for same-origin requests)",
        ],
        testEndpoints: [
          "OPTIONS: http://api.gloriaconnect.com/api/auth/login",
          "POST: http://api.gloriaconnect.com/api/auth/login",
          "GET: http://api.gloriaconnect.com/api/debug",
        ],
        frontendChecks: [
          "1. Open browser DevTools (F12) → Network tab",
          "2. Make your login request from frontend",
          "3. Click on the /api/auth/login request",
          "4. Check 'Response' tab - is the JSON body there?",
          "5. Check 'Headers' tab - what's the actual response?",
          "6. Check 'Console' tab - any JavaScript errors?",
          "7. Look for 'Access-Control-Allow-Origin' in Response Headers",
        ],
        importantNote: "Your logs show successful logins! The backend IS working. If you're not seeing responses in the browser, check the Network tab in DevTools to see what the browser actually received.",
      },
    };

    res.status(200).json(debugInfo);
  } catch (error: any) {
    logger.error("Error in debug endpoint:", error);
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: error.message || "An error occurred while fetching debug information",
      timestamp: new Date().toISOString(),
    });
  }
});

// OPTIONS handler for preflight
debugRouter.options("/api/debug", (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Expose-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.removeHeader('Vary');
  res.status(204).end();
});

// Also mount at root /debug for easier access
debugRouter.get("/debug", async (req: Request, res: Response) => {
  // CRITICAL: Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Expose-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.removeHeader('Vary');

  // Redirect to /api/debug handler
  const lines = parseInt(req.query.lines as string) || 50;
  const includeErrors = req.query.errors === 'true';
  
  // Reuse the same logic
  try {
    const requestInfo = {
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      headers: {
        origin: req.headers.origin || 'Not set',
        referer: req.headers.referer || 'Not set',
        'user-agent': req.headers['user-agent'] || 'Not set',
      },
      ip: req.ip,
      timestamp: new Date().toISOString(),
    };

    const serverLogs = await getPm2Logs(lines);
    const errorLogs = includeErrors ? await getPm2ErrorLogs(lines) : "Add ?errors=true";

    res.status(200).json({
      timestamp: new Date().toISOString(),
      request: requestInfo,
      logs: {
        server: serverLogs.split('\n').slice(-lines),
        errors: includeErrors ? errorLogs.split('\n').slice(-lines) : "Add ?errors=true",
      },
      message: "For full debug info, use /api/debug",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

debugRouter.options("/debug", (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Expose-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.removeHeader('Vary');
  res.status(204).end();
});
