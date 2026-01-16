import { Router } from 'express';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../../infra/auth.js';
const router = Router();
// SDK type mapping
const SDK_MAP = {
    nodejs: 'nodejs-agent',
    typescript: 'nodejs-agent', // TypeScript uses same SDK as Node.js
    javascript: 'nodejs-agent',
    python: 'python-agent',
    php: 'php-agent',
    java: 'java-agent',
    go: 'go-agent',
    perl: 'perl-agent',
};
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
                available: Object.keys(SDK_MAP),
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
        // Add SDK directory
        zip.addLocalFolder(sdkPath, sdkDir);
        // Add proto files (for gRPC support)
        const protoPath = path.join(process.cwd(), 'protos');
        if (fs.existsSync(protoPath)) {
            const protoFiles = fs.readdirSync(protoPath).filter(f => f.endsWith('.proto'));
            protoFiles.forEach(file => {
                const filePath = path.join(protoPath, file);
                zip.addLocalFile(filePath, 'protos');
            });
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
                available: Object.keys(SDK_MAP),
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
        else if (sdkType === 'php') {
            const composerPath = path.join(sdkPath, 'composer.json');
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
        java: 'Add dependency to pom.xml (see SDK info)',
        go: 'go get github.com/carhire/go-sdk',
        perl: 'cpanm CarHire::SDK',
    };
    return commands[sdkType] || `Install ${sdkType} SDK`;
}
function generateReadme(sdkType, sdkDir) {
    const installCmd = getInstallCommand(sdkType);
    return `# ${sdkType.toUpperCase()} SDK Installation Guide

## Installation

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
