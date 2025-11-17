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
      if (!unlocode) continue;
      await prisma.uNLocode.upsert({
        where: { unlocode },
        update: { country, place, iataCode: iataCode || null, latitude: lat ? Number(lat) : null, longitude: lon ? Number(lon) : null },
        create: { unlocode, country, place, iataCode: iataCode || null, latitude: lat ? Number(lat) : null, longitude: lon ? Number(lon) : null }
      });
      count++;
      if (count % 500 === 0) console.log("Imported", count);
    }
    console.log("UN/LOCODE import complete:", count);
    return;
  }

  // Minimal fallback seed (demo only)
  const sample = [
    { unlocode: "GBMAN", country: "GB", place: "Manchester", iataCode: "MAN", latitude: 53.36, longitude: -2.27 },
    { unlocode: "GBGLA", country: "GB", place: "Glasgow", iataCode: "GLA", latitude: 55.87, longitude: -4.43 },
    { unlocode: "FRPAR", country: "FR", place: "Paris", iataCode: "PAR", latitude: 48.85, longitude: 2.35 },
    { unlocode: "ESMAD", country: "ES", place: "Madrid", iataCode: "MAD", latitude: 40.42, longitude: -3.70 }
  ];
  for (const r of sample) {
    await prisma.uNLocode.upsert({ where: { unlocode: r.unlocode }, update: r, create: r });
  }
  console.log("Seeded demo UN/LOCODE entries:", sample.length);
}

main().finally(() => prisma.$disconnect());
