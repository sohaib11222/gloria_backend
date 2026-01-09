import { v4 as uuid } from "uuid";
export function requestId() {
    return (req, res, next) => {
        const id = req.headers["x-request-id"]?.toString() || uuid();
        res.setHeader("x-request-id", id);
        req.requestId = id;
        next();
    };
}
