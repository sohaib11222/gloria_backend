import { v4 as uuid } from "uuid";
import type { Request, Response, NextFunction } from "express";

export function requestId() {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = req.headers["x-request-id"]?.toString() || uuid();
    res.setHeader("x-request-id", id);
    (req as any).requestId = id;
    next();
  };
}




