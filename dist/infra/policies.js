import { prisma } from "../data/prisma.js";
export function requireRole(...roles) {
    return (req, res, next) => {
        const role = req.user?.role;
        if (!role || !roles.includes(role)) {
            return res.status(403).json({
                error: "FORBIDDEN",
                message: "Insufficient role",
                required: roles,
                actual: role || "none"
            });
        }
        next();
    };
}
export function requireCompanyType(...types) {
    return (req, res, next) => {
        const type = req.user?.type;
        if (!type || !types.includes(type)) {
            return res.status(403).json({
                error: "FORBIDDEN",
                message: "Wrong company type",
                required: types,
                actual: type || "none"
            });
        }
        next();
    };
}
export function requireCompanyStatus(status) {
    return async (req, res, next) => {
        const userRole = req.user?.role;
        // Allow admins to bypass company status check
        if (userRole === "ADMIN") {
            return next();
        }
        const companyId = req.user?.companyId;
        if (!companyId)
            return res.status(401).json({ error: "AUTH_ERROR" });
        const c = await prisma.company.findUnique({ where: { id: companyId } });
        if (!c)
            return res.status(401).json({ error: "AUTH_ERROR" });
        if (c.status !== status)
            return res.status(403).json({ error: "FORBIDDEN", message: `Company must be ${status}` });
        next();
    };
}
