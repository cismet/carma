import type { FeatureSelection } from "@carma-api";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * An info box text as plain text: the box takes one line of html as
 * `<html>...</html>`, a caller of the api needs only the words. Table cells
 * are kept apart by a space, rows and blocks by a semicolon.
 */
export const plainText = (value: string): string => {
  const html = /^<html>(.*)<\/html>$/s.exec(value)?.[1];
  if (html === undefined) {
    return value;
  }
  const marked = html
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<\/(td|th)>/gi, " ")
    .replace(/<\/(tr|div|p|li|h\d)>|<br\s*\/?>/gi, "; ");
  const text =
    new DOMParser().parseFromString(marked, "text/html").body.textContent ??
    "";
  return text
    .replace(/\s+/g, " ")
    .replace(/(\s*;\s*)+/g, "; ")
    .replace(/^[\s;]+|[\s;]+$/g, "");
};

/**
 * The info box entry (`features.selectedFeature`) as `carma.mapping2D.selectFeature`
 * reports it: header, title and subtitle as plain text, and the object's own
 * attributes.
 */
export const describeSelection = (
  selected: unknown
): FeatureSelection["selected"] => {
  if (!isRecord(selected) || !isRecord(selected["properties"])) {
    return null;
  }
  const properties = selected["properties"];
  const text = (key: string) => {
    const value = properties[key];
    const plain = typeof value === "string" ? plainText(value) : "";
    return plain !== "" ? { [key]: plain } : {};
  };
  const sourceFeature = selected["sourceFeature"];
  const featureProperties =
    isRecord(sourceFeature) && isRecord(sourceFeature["properties"])
      ? sourceFeature["properties"]
      : isRecord(properties["sourceProps"])
      ? properties["sourceProps"]
      : undefined;
  // a label feature points at the area feature holding the attributes
  const attributes =
    featureProperties && isRecord(featureProperties["targetProperties"])
      ? featureProperties["targetProperties"]
      : featureProperties;
  const raw = attributes
    ? Object.fromEntries(
        Object.entries(attributes).filter(
          ([key, value]) =>
            key !== "carmaInfo" &&
            // a data layer's info box texts and colours, worked out from the rest
            !key.startsWith("__") &&
            value !== null &&
            !(typeof value === "string" && value.trim() === "")
        )
      )
    : undefined;
  return {
    ...text("header"),
    title:
      typeof properties["title"] === "string"
        ? plainText(properties["title"])
        : "",
    ...text("subtitle"),
    ...(raw && { properties: raw }),
  };
};
