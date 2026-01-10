import { makeSourceGrpcClient, srcProm } from "../../grpc/clients/sourceClient.js";
import { makeAgentGrpcClient, agtProm } from "../../grpc/clients/agentClient.js";
function toAddr(input) {
    // allow "grpc://host:port" or "host:port"
    return input.startsWith("grpc://") ? input.replace("grpc://", "") : input;
}
export const testSourceGrpc = async (req, res) => {
    try {
        const { address, availabilityPayload, runBooking = false, bookingPayload } = req.body || {};
        if (!address)
            return res.status(400).json({ message: "address required (grpc://host:port or host:port)" });
        const client = makeSourceGrpcClient(toAddr(address));
        const results = [];
        const t1 = Date.now();
        const h = await srcProm(client, "GetHealth", {});
        results.push({ name: "Health", status: "PASSED", response: h, duration_ms: Date.now() - t1 });
        const t2 = Date.now();
        const loc = await srcProm(client, "GetLocations", {});
        results.push({
            name: "Locations",
            status: Array.isArray(loc?.locations) && loc.locations.length ? "PASSED" : "FAILED",
            response: loc,
            duration_ms: Date.now() - t2
        });
        const t3 = Date.now();
        const avail = await srcProm(client, "GetAvailability", availabilityPayload || {
            pickup_unlocode: "GBMAN",
            dropoff_unlocode: "GBGLA",
            pickup_iso: new Date().toISOString(),
            dropoff_iso: new Date(Date.now() + 48 * 3600 * 1000).toISOString()
        });
        results.push({
            name: "Availability",
            status: Array.isArray(avail?.vehicles) && avail.vehicles.length ? "PASSED" : "FAILED",
            response: avail,
            duration_ms: Date.now() - t3
        });
        if (runBooking) {
            const t4 = Date.now();
            const created = await srcProm(client, "CreateBooking", bookingPayload || {
                PickupLocation: "GBMAN",
                DropOffLocation: "GBGLA",
                VehicleClass: "CDMR"
            });
            results.push({
                name: "Booking Create",
                status: created?.BookingReference ? "PASSED" : "FAILED",
                response: created,
                duration_ms: Date.now() - t4
            });
            if (created?.BookingReference) {
                const ref = created.BookingReference;
                const t5 = Date.now();
                const checked = await srcProm(client, "CheckBooking", { BookingReference: ref });
                results.push({
                    name: "Booking Check",
                    status: checked?.BookingReference === ref ? "PASSED" : "FAILED",
                    response: checked,
                    duration_ms: Date.now() - t5
                });
                const t6 = Date.now();
                const cancelled = await srcProm(client, "CancelBooking", { BookingReference: ref });
                results.push({
                    name: "Booking Cancel",
                    status: cancelled?.BookingReference === ref ? "PASSED" : "FAILED",
                    response: cancelled,
                    duration_ms: Date.now() - t6
                });
            }
        }
        res.json({ ok: true, address, results });
    }
    catch (e) {
        const msg = e?.message || String(e);
        if (msg.includes("Unable to locate source_provider.proto")) {
            return res.status(500).json({
                ok: false,
                error: msg,
                fix: "Set SOURCE_PROVIDER_PROTO_PATH env or place file under <repo-root>/protos or <middleware-backend>/protos."
            });
        }
        res.status(500).json({ ok: false, error: msg });
    }
};
export const testAgentGrpc = async (req, res) => {
    try {
        const { address, searchPayload, bookPayload } = req.body || {};
        if (!address)
            return res.status(400).json({ message: "address required (grpc://host:port or host:port)" });
        const client = makeAgentGrpcClient(toAddr(address));
        const results = [];
        const t1 = Date.now();
        const h = await agtProm(client, "GetHealth", {});
        results.push({
            name: "Agent Health",
            status: h?.ok === false ? "FAILED" : "PASSED",
            response: h,
            duration_ms: Date.now() - t1
        });
        if (searchPayload) {
            const t2 = Date.now();
            const s = await agtProm(client, "RunSearch", searchPayload);
            results.push({
                name: "Agent Search",
                status: s?.request_id ? "PASSED" : "FAILED",
                response: s,
                duration_ms: Date.now() - t2
            });
        }
        if (bookPayload) {
            const t3 = Date.now();
            const b = await agtProm(client, "RunBook", bookPayload);
            results.push({
                name: "Agent Book",
                status: b?.booking_id ? "PASSED" : "FAILED",
                response: b,
                duration_ms: Date.now() - t3
            });
        }
        res.json({ ok: true, address, results });
    }
    catch (e) {
        const msg = e?.message || String(e);
        if (msg.includes("Unable to locate agent_tester.proto")) {
            return res.status(500).json({
                ok: false,
                error: msg,
                fix: "Set AGENT_TESTER_PROTO_PATH env or place file under <repo-root>/protos or <middleware-backend>/protos."
            });
        }
        res.status(500).json({ ok: false, error: msg });
    }
};
