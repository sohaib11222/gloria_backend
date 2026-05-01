/**
 * Quick sanity: PHP var_dump → convertPhpVarDumpToObject → parseGloriaAvailabilityOffers
 * Run: npx tsx scripts/smoke-gloria-php-parse.ts
 */
import { convertPhpVarDumpToObject } from "../src/services/phpVarDumpVehAvail.ts";
import { parseGloriaAvailabilityOffers } from "../src/services/gloriaAvailability.ts";

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

const root = convertPhpVarDumpToObject(multilineKeyDump);
const offers = parseGloriaAvailabilityOffers(root, "test-src", { agreement_ref: "Gloria002" });
const o0 = offers[0];
if (!o0 || o0.vehicle_class !== "CCAR" || o0.total_price !== 150 || !String(o0.supplier_offer_ref).includes("ABC")) {
  console.error("FAIL", offers);
  process.exit(1);
}
console.log("OK", { class: o0.vehicle_class, mm: o0.vehicle_make_model, ref: o0.supplier_offer_ref, price: o0.total_price });
