/**
 * Quick sanity: PHP var_dump → Gloria availability offers
 * Run: npx tsx scripts/smoke-gloria-php-parse.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { convertPhpVarDumpToObject } from "../src/services/phpVarDumpVehAvail.ts";
import { parseGloriaAvailabilityOffers } from "../src/services/gloriaAvailability.ts";
import { parseGloriaAvailabilityFromResponseText } from "../src/services/gloriaXmlParse.ts";

const multilineKeyDump = `
array(3) {
  ["@attributes"]=>
  array(1) {
    ["Version"]=>
    string(4) "1.00"
  }
  ["Success"]=>
  array(0) {
  }
  ["VehAvairsdetails"]=>
  array(1) {
    ["availcars"]=>
    array(1) {
      [0]=>
      array(3) {
        ["@attributes"]=>
        array(1) {
          ["ACRISS"]=>
          string(4) "CCAR"
        }
        ["vehdetails"]=>
        array(1) {
          [0]=>
          array(1) {
            ["@attributes"]=>
            array(2) {
              ["Make"]=>
              string(5) "SKODA"
              ["Model"]=>
              string(5) "FABIA"
            }
          }
        }
        ["pricing"]=>
        array(1) {
          [0]=>
          array(1) {
            ["@attributes"]=>
            array(3) {
              ["CarOrderID"]=>
              string(3) "ABC"
              ["Currency"]=>
              string(3) "EUR"
              ["TotalGross"]=>
              string(6) "150.00"
            }
          }
        }
      }
    }
  }
}
`;

async function main() {
  const root = convertPhpVarDumpToObject(multilineKeyDump);
  const offers = parseGloriaAvailabilityOffers(root, "test-src", {
    agreement_ref: "Gloria002",
  });
  const o0 = offers[0];
  if (
    !o0 ||
    o0.vehicle_class !== "CCAR" ||
    o0.total_price !== 150 ||
    !String(o0.supplier_offer_ref).includes("ABC")
  ) {
    console.error("FAIL php-array dump", offers);
    process.exit(1);
  }
  console.log("OK php-array", {
    class: o0.vehicle_class,
    mm: o0.vehicle_make_model,
    ref: o0.supplier_offer_ref,
    price: o0.total_price,
  });

  const samplePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../Docs/sampleresponsepricing.html",
  );
  if (fs.existsSync(samplePath)) {
    const raw = fs.readFileSync(samplePath, "utf8");
    const t0 = Date.now();
    const xmlOffers = await parseGloriaAvailabilityFromResponseText(raw, "test-src", {
      agreement_ref: "Gloria001",
    });
    const x0 = xmlOffers[0];
    if (!x0 || xmlOffers.length < 2 || x0.vehicle_class !== "CCAR" || x0.total_price !== 190) {
      console.error("FAIL av.php sample", {
        count: xmlOffers.length,
        first: x0,
        ms: Date.now() - t0,
      });
      process.exit(1);
    }
    console.log("OK av.php sample", {
      count: xmlOffers.length,
      class: x0.vehicle_class,
      price: x0.total_price,
      included: x0.veh_terms_included?.length,
      notIncluded: x0.veh_terms_not_included?.length,
      terms: x0.gloria_terms?.length,
      ms: Date.now() - t0,
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
