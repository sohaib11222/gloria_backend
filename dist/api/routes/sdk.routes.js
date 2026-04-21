import { Router } from 'express';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../../infra/auth.js';
const router = Router();
/**
 * URL slug → folder under `sdks/` (repository root when the API runs).
 *
 * Portals use:
 * - **php-agent** — broker `CarHireClient` (Agent app download).
 * - **php-source** — supplier OTA + Laravel + optional gRPC bundle (`gloria-source-supplier`).
 * - **php** — alias of **php-agent** (legacy).
 *
 * After deploy, verify: `GET /api/docs/sdk/registry` includes `php-source` and `php-agent`.
 */
const SDK_MAP = {
    nodejs: 'nodejs-agent',
    typescript: 'nodejs-agent', // TypeScript uses same SDK as Node.js
    javascript: 'nodejs-agent',
    python: 'python-agent',
    php: 'php-agent',
    'php-agent': 'php-agent',
    'php-source': 'gloria-source-supplier',
    /** Same folder; allows download URL to match repo directory name */
    'gloria-source-supplier': 'gloria-source-supplier',
    /** Tolerate underscore in clients or old links */
    php_source: 'gloria-source-supplier',
    java: 'java-agent',
    go: 'go-agent',
    perl: 'perl-agent',
};
/** Sorted list for error responses and `GET .../sdk/registry` */
export const SDK_DOWNLOAD_SLUGS = Object.keys(SDK_MAP).sort();
/**
 * GET /docs/sdk/registry (also under /api/docs when mounted)
 * Public: lets you confirm production has the same route map as git (includes php-source / php-agent).
 */
router.get('/sdk/registry', (_req, res) => {
    res.json({
        slugs: SDK_DOWNLOAD_SLUGS,
        bundles: {
            agentBroker: ['php', 'php-agent'],
            sourceSupplier: ['php-source', 'gloria-source-supplier', 'php_source'],
        },
    });
});
/** Exclude heavy / generated dirs from downloadable zips */
function sdkFolderZipFilter(entryPath) {
    const p = entryPath.replace(/\\/g, '/').toLowerCase();
    return !(p.includes('/node_modules/') ||
        p.includes('/vendor/') ||
        p.includes('/.phpunit.cache/') ||
        p.includes('/dist/') ||
        p.includes('/coverage/') ||
        p.includes('/.git/'));
}
/**
 * GET /docs/sdk/:sdkType/download
 * Download SDK as ZIP file
 */
router.get('/sdk/:sdkType/download', requireAuth(), async (req, res) => {
    try {
        const { sdkType } = req.params;
        const sdkDir = SDK_MAP[sdkType.toLowerCase()];
        if (!sdkDir) {
            return res.status(400).json({
                error: 'INVALID_SDK_TYPE',
                message: `Unknown SDK type: ${sdkType}`,
                available: SDK_DOWNLOAD_SLUGS,
                hint: 'Deploy backend that includes php-source & php-agent in sdk.routes.ts, or GET /api/docs/sdk/registry to verify.',
            });
        }
        const sdkPath = path.join(process.cwd(), 'sdks', sdkDir);
        if (!fs.existsSync(sdkPath)) {
            return res.status(404).json({
                error: 'SDK_NOT_FOUND',
                message: `SDK directory not found: ${sdkPath}`,
                hint: 'Ensure SDK is built and available in sdks/ directory',
            });
        }
        // Create zip file
        const zip = new AdmZip();
        // Add SDK directory (skip vendor/node_modules etc.)
        zip.addLocalFolder(sdkPath, sdkDir, sdkFolderZipFilter);
        // Add proto files (for gRPC support)
        const protoPath = path.join(process.cwd(), 'protos');
        if (fs.existsSync(protoPath)) {
            const protoFiles = fs.readdirSync(protoPath).filter(f => f.endsWith('.proto'));
            protoFiles.forEach(file => {
                const filePath = path.join(protoPath, file);
                zip.addLocalFile(filePath, 'protos');
            });
        }
        const clientSupplierProto = path.join(sdkPath, 'proto', 'gloria_client_supplier.proto');
        if (fs.existsSync(clientSupplierProto)) {
            zip.addLocalFile(clientSupplierProto, 'protos');
        }
        // Add README with installation instructions
        const readmeContent = generateReadme(sdkType, sdkDir);
        zip.addFile('INSTALLATION.md', Buffer.from(readmeContent, 'utf-8'));
        const zipBuffer = zip.toBuffer();
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${sdkType}-sdk.zip"`);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        res.send(zipBuffer);
    }
    catch (error) {
        res.status(500).json({
            error: 'DOWNLOAD_FAILED',
            message: 'Failed to create SDK package',
            details: error.message,
        });
    }
});
/**
 * GET /docs/sdk/:sdkType/info
 * Get SDK information (version, install command, etc.)
 */
router.get('/sdk/:sdkType/info', async (req, res) => {
    try {
        const { sdkType } = req.params;
        const sdkDir = SDK_MAP[sdkType.toLowerCase()];
        if (!sdkDir) {
            return res.status(400).json({
                error: 'INVALID_SDK_TYPE',
                message: `Unknown SDK type: ${sdkType}`,
                available: SDK_DOWNLOAD_SLUGS,
                hint: 'Deploy backend that includes php-source & php-agent in sdk.routes.ts, or GET /api/docs/sdk/registry to verify.',
            });
        }
        const sdkPath = path.join(process.cwd(), 'sdks', sdkDir);
        if (!fs.existsSync(sdkPath)) {
            return res.status(404).json({
                error: 'SDK_NOT_FOUND',
                message: `SDK directory not found`,
            });
        }
        // Read SDK metadata
        let info = {
            sdkType: sdkType.toLowerCase(),
            name: `${sdkType}-sdk`,
            version: '1.0.0',
            description: `Car-Hire ${sdkType} SDK`,
            ready: true,
        };
        // Try to read package-specific files
        if (sdkType === 'nodejs' || sdkType === 'typescript' || sdkType === 'javascript') {
            const pkgPath = path.join(sdkPath, 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                info = { ...info, ...pkg };
            }
        }
        else if (sdkType === 'python') {
            const pyprojectPath = path.join(sdkPath, 'pyproject.toml');
            if (fs.existsSync(pyprojectPath)) {
                // Basic TOML parsing (you might want to use a proper TOML parser)
                const content = fs.readFileSync(pyprojectPath, 'utf-8');
                const versionMatch = content.match(/version\s*=\s*["']([^"']+)["']/);
                const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/);
                if (versionMatch)
                    info.version = versionMatch[1];
                if (nameMatch)
                    info.name = nameMatch[1];
            }
        }
        else if (sdkDir === 'php-agent') {
            const composerPath = path.join(sdkPath, 'composer.json');
            if (fs.existsSync(composerPath)) {
                const composer = JSON.parse(fs.readFileSync(composerPath, 'utf-8'));
                info.name = composer.name || info.name;
                info.version = composer.version || info.version;
                info.description = composer.description || info.description;
            }
        }
        else if (sdkDir === 'gloria-source-supplier') {
            const composerPath = path.join(sdkPath, 'php', 'composer.json');
            if (fs.existsSync(composerPath)) {
                const composer = JSON.parse(fs.readFileSync(composerPath, 'utf-8'));
                info.name = composer.name || info.name;
                info.version = composer.version || info.version;
                info.description = composer.description || info.description;
            }
        }
        else if (sdkType === 'java') {
            const pomPath = path.join(sdkPath, 'pom.xml');
            if (fs.existsSync(pomPath)) {
                const pom = fs.readFileSync(pomPath, 'utf-8');
                const versionMatch = pom.match(/<version>([^<]+)<\/version>/);
                const artifactMatch = pom.match(/<artifactId>([^<]+)<\/artifactId>/);
                if (versionMatch)
                    info.version = versionMatch[1];
                if (artifactMatch)
                    info.name = artifactMatch[1];
            }
        }
        else if (sdkType === 'go') {
            const goModPath = path.join(sdkPath, 'go.mod');
            if (fs.existsSync(goModPath)) {
                const goMod = fs.readFileSync(goModPath, 'utf-8');
                const moduleMatch = goMod.match(/module\s+([^\s]+)/);
                if (moduleMatch)
                    info.name = moduleMatch[1];
            }
        }
        // Get install command
        info.installCommand = getInstallCommand(sdkType.toLowerCase());
        res.json(info);
    }
    catch (error) {
        res.status(500).json({
            error: 'INFO_FETCH_FAILED',
            message: 'Failed to get SDK information',
            details: error.message,
        });
    }
});
/**
 * GET /docs/sdk/:sdkType/examples
 * Get example code files
 */
router.get('/sdk/:sdkType/examples', async (req, res) => {
    try {
        const { sdkType } = req.params;
        const sdkDir = SDK_MAP[sdkType.toLowerCase()];
        if (!sdkDir) {
            return res.status(400).json({ error: 'Invalid SDK type' });
        }
        const examplesPath = path.join(process.cwd(), 'sdks', sdkDir, 'examples');
        if (!fs.existsSync(examplesPath)) {
            return res.json({ examples: [] });
        }
        const examples = fs.readdirSync(examplesPath)
            .filter(file => {
            const ext = path.extname(file);
            return ['.js', '.ts', '.py', '.php', '.java', '.go', '.pl'].includes(ext);
        })
            .map(file => {
            const filePath = path.join(examplesPath, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            return {
                filename: file,
                content,
                language: path.extname(file).slice(1),
            };
        });
        res.json({ examples });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Helper functions
function getInstallCommand(sdkType) {
    const commands = {
        nodejs: 'npm install @carhire/nodejs-sdk',
        typescript: 'npm install @carhire/nodejs-sdk',
        javascript: 'npm install @carhire/nodejs-sdk',
        python: 'pip install carhire-python-sdk',
        php: 'composer require carhire/php-sdk',
        'php-agent': 'composer require carhire/php-sdk',
        'php-source': 'cd php && composer install   # see bundle README for Laravel + node-wrapper',
        php_source: 'cd php && composer install   # see bundle README for Laravel + node-wrapper',
        'gloria-source-supplier': 'cd php && composer install   # see bundle README for Laravel + node-wrapper',
        java: 'Add dependency to pom.xml (see SDK info)',
        go: 'go get github.com/carhire/go-sdk',
        perl: 'cpanm CarHire::SDK',
    };
    return commands[sdkType] || `Install ${sdkType} SDK`;
}
function generateReadme(sdkType, sdkDir) {
    if (sdkDir === 'gloria-source-supplier') {
        return `# Source (supplier) integration bundle

This ZIP is for **rental companies / suppliers** exposing OTA XML to Gloria: PHP adapter, Laravel routes, optional Node gRPC bridge, and \`gloria_client_supplier.proto\`.

It is **not** the agent broker PHP SDK (\`CarHireClient\`). Booking agents should download **php-agent** from the Agent portal SDK docs.

## Layout

- \`php/\` — Composer package (run \`composer install\` here)
- \`laravel/\` — copy routes, controller, config into your app
- \`node-wrapper/\` — optional gRPC server to Laravel
- \`docs/MAPPING.md\` — contract vs backend TS

See \`README.md\` in the bundle root for the full quick start.
`;
    }
    const installCmd = getInstallCommand(sdkType);
    const title = sdkDir === 'php-agent' ? 'PHP AGENT (broker) SDK' : `${sdkType.toUpperCase()} SDK`;
    const roleBlurb = sdkDir === 'php-agent'
        ? `**Role:** This package is for **booking agents / brokers** calling Gloria (REST/gRPC). Suppliers integrating OTA should use the **php-source** bundle instead.\n\n`
        : '';
    return `# ${title} Installation Guide

${roleBlurb}## Installation

\`\`\`bash
${installCmd}
\`\`\`

## Quick Start

See the examples/ directory for complete examples.

## Documentation

See README.md in the SDK directory for full documentation.

## Support

For issues or questions, contact support or check the main documentation.
`;
}
export default router;
