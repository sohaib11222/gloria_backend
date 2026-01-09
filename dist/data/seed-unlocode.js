import fs from "fs";
import path from "path";
import { prisma } from "./prisma.js";
async function main() {
    const csvPath = path.resolve("data", "unlocode.csv"); // optional external CSV
    if (fs.existsSync(csvPath)) {
        const text = fs.readFileSync(csvPath, "utf8");
        const lines = text.split(/\r?\n/).filter(Boolean);
        let count = 0;
        for (const line of lines) {
            const [unlocode, country, place, iataCode, lat, lon] = line.split(",");
            if (!unlocode)
                continue;
            await prisma.uNLocode.upsert({
                where: { unlocode },
                update: { country, place, iataCode: iataCode || null, latitude: lat ? Number(lat) : null, longitude: lon ? Number(lon) : null },
                create: { unlocode, country, place, iataCode: iataCode || null, latitude: lat ? Number(lat) : null, longitude: lon ? Number(lon) : null }
            });
            count++;
            if (count % 500 === 0)
                console.log("Imported", count);
        }
        console.log("UN/LOCODE import complete:", count);
        return;
    }
    // Comprehensive demo seed data - matches source-backend locations
    const sample = [
        // UK Locations (matching source-backend branches)
        { unlocode: "GBMAN", country: "GB", place: "Manchester", iataCode: "MAN", latitude: 53.3656, longitude: -2.2729 },
        { unlocode: "GBGLA", country: "GB", place: "Glasgow", iataCode: "GLA", latitude: 55.8642, longitude: -4.4331 },
        { unlocode: "GBLHR", country: "GB", place: "London Heathrow", iataCode: "LHR", latitude: 51.4700, longitude: -0.4543 },
        { unlocode: "GBLGW", country: "GB", place: "London Gatwick", iataCode: "LGW", latitude: 51.1537, longitude: -0.1821 },
        { unlocode: "GBEDI", country: "GB", place: "Edinburgh", iataCode: "EDI", latitude: 55.9500, longitude: -3.3725 },
        { unlocode: "GBBHX", country: "GB", place: "Birmingham", iataCode: "BHX", latitude: 52.4524, longitude: -1.7435 },
        // Additional common locations for testing
        { unlocode: "FRPAR", country: "FR", place: "Paris", iataCode: "PAR", latitude: 48.8566, longitude: 2.3522 },
        { unlocode: "ESMAD", country: "ES", place: "Madrid", iataCode: "MAD", latitude: 40.4168, longitude: -3.7038 },
        { unlocode: "DEBER", country: "DE", place: "Berlin", iataCode: "BER", latitude: 52.5200, longitude: 13.4050 },
        { unlocode: "ITROM", country: "IT", place: "Rome", iataCode: "FCO", latitude: 41.9028, longitude: 12.4964 },
        { unlocode: "USNYC", country: "US", place: "New York", iataCode: "NYC", latitude: 40.7128, longitude: -74.0060 },
        { unlocode: "USLAX", country: "US", place: "Los Angeles", iataCode: "LAX", latitude: 34.0522, longitude: -118.2437 },
    ];
    console.log("Seeding UN/LOCODE entries...");
    for (const r of sample) {
        await prisma.uNLocode.upsert({
            where: { unlocode: r.unlocode },
            update: r,
            create: r
        });
    }
    console.log(`✅ Seeded ${sample.length} UN/LOCODE entries`);
}
main().finally(() => prisma.$disconnect());
