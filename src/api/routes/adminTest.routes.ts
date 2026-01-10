import { Router } from "express";
import { testSourceGrpc, testAgentGrpc } from "../controllers/adminTest.controller.js";

const router = Router();

router.post("/source-grpc", testSourceGrpc);
router.post("/agent-grpc", testAgentGrpc);

export default router;
