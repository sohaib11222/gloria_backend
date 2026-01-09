import * as grpc from "@grpc/grpc-js";
export function metaFromReq(req) {
    const md = new grpc.Metadata();
    if (req?.requestId)
        md.set("x-request-id", String(req.requestId));
    if (req?.user?.companyId)
        md.set("x-company-id", String(req.user.companyId));
    if (req?.user?.role)
        md.set("x-role", String(req.user.role));
    return md;
}
