export function redactPII(obj) {
    try {
        const clone = JSON.parse(JSON.stringify(obj));
        const scrub = (o) => {
            if (!o || typeof o !== "object")
                return;
            for (const k of Object.keys(o)) {
                const key = k.toLowerCase();
                if (["email", "phone", "card", "pan", "cvv", "firstname", "first_name", "lastname", "last_name", "password", "token", "secret", "key"].some(p => key.includes(p))) {
                    o[k] = "***redacted***";
                }
                else if (typeof o[k] === "object") {
                    scrub(o[k]);
                }
            }
        };
        scrub(clone);
        return JSON.stringify(clone, null, 2); // Pretty print with 2-space indentation
    }
    catch {
        return "{}";
    }
}
