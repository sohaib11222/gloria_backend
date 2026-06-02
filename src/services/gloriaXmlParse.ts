import { parseGloriaAvailabilityOffers } from "./gloriaAvailability.js";
import type { Offer } from "../adapters/registry.js";
import { extractXmlFromSupplierResponse } from "./phpVarDumpVehAvail.js";

/** fast-xml-parser config for GLORIA_availabilityrs (av.php / Right Cars style). */
export async function parseGloriaAvailabilityXmlText(
	responseText: string,
): Promise<any | null> {
	const xmlText = extractXmlFromSupplierResponse(responseText);
	if (
		!xmlText.includes("GLORIA_availability") &&
		!xmlText.includes("VehAvairsdetails")
	) {
		return null;
	}
	if (!xmlText.trim().startsWith("<")) return null;

	const { XMLParser } = await import("fast-xml-parser");
	const xmlParser = new XMLParser({
		ignoreAttributes: false,
		attributesGroupName: "@attributes",
		attributeNamePrefix: "",
		parseAttributeValue: false,
		trimValues: true,
		removeNSPrefix: true,
		isArray: (tagName: string) => {
			const t = tagName.toLowerCase();
			return (
				t === "availcars" ||
				t === "item" ||
				t === "country" ||
				t === "oneway" ||
				t === "ageband" ||
				t === "charge" ||
				t === "hours" ||
				t === "day" ||
				t === "closure" ||
				t === "paymentmethod"
			);
		},
	});
	const parsedXml = xmlParser.parse(xmlText);
	const rootKey = Object.keys(parsedXml).find((k) =>
		k.includes("GLORIA_availabilityrs"),
	);
	return rootKey ? parsedXml[rootKey] : parsedXml;
}

export async function parseGloriaAvailabilityFromResponseText(
	responseText: string,
	sourceId: string,
	criteria: { agreement_ref?: string },
): Promise<Offer[]> {
	const gloriaRoot = await parseGloriaAvailabilityXmlText(responseText);
	if (!gloriaRoot) return [];
	return parseGloriaAvailabilityOffers(gloriaRoot, sourceId, criteria);
}
