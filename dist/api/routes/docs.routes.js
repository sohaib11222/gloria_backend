import { Router } from 'express';
import { DOCS } from '../../docs/spec.js';
import fs from 'fs';
import { resolveProtoPath } from '../../grpc/util/resolveProtoPath.js';
const router = Router();
// Handle OPTIONS preflight for all docs routes
router.options('*', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    res.sendStatus(204);
});
// GET /docs → all docs
router.get('/', (req, res) => {
    // Set CORS headers explicitly
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Expose-Headers', '*');
    res.json(DOCS);
});
// GET /docs/proto/source_provider.proto → download the proto file
// IMPORTANT: This route must come BEFORE /:role to avoid route conflicts
router.get('/proto/source_provider.proto', (req, res) => {
    try {
        // Use the existing resolveProtoPath utility that handles all path resolution scenarios
        const { path: protoPath, tried } = resolveProtoPath('source_provider.proto');
        if (!protoPath) {
            return res.status(404).json({
                error: 'PROTO_FILE_NOT_FOUND',
                message: 'Source provider proto file not found',
                hint: 'Contact support if this error persists',
                triedPaths: tried,
                cwd: process.cwd()
            });
        }
        const protoContent = fs.readFileSync(protoPath, 'utf-8');
        // Validate that we actually read content
        if (!protoContent || protoContent.trim().length === 0) {
            return res.status(500).json({
                error: 'PROTO_FILE_EMPTY',
                message: 'Proto file exists but is empty',
                path: protoPath
            });
        }
        // Set headers for file download
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="source_provider.proto"');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        res.send(protoContent);
    }
    catch (error) {
        res.status(500).json({
            error: 'PROTO_FILE_READ_ERROR',
            message: 'Failed to read proto file',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});
// GET /docs/:role → filter by role = admin | agent | source
// IMPORTANT: This route must come AFTER /proto/* routes
router.get('/:role', (req, res) => {
    // Set CORS headers explicitly
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Expose-Headers', '*');
    const role = req.params.role;
    if (!['admin', 'agent', 'source'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be admin, agent, or source' });
    }
    const filtered = DOCS.map((cat) => ({
        ...cat,
        endpoints: cat.endpoints.filter((e) => !e.roles || e.roles.includes(role)),
    })).filter((cat) => cat.endpoints.length > 0);
    res.json(filtered);
});
export default router;
