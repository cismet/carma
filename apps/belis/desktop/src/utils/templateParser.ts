import { KeyTableDisplayConfig } from "../config/keyTableDisplayConfig";

/**
 * Parses a template string and replaces {fieldName} placeholders with values from an item.
 *
 * @param template - Template string with {fieldName} placeholders
 * @param item - Object containing field values
 * @param separator - Optional separator used between fields (for cleanup)
 * @returns The resolved string with placeholders replaced
 */
export function parseTemplate(
  template: string,
  item: Record<string, unknown>,
  separator: string = " - "
): string {
  // Replace all {fieldName} placeholders with actual values
  let result = template.replace(/{(\w+)}/g, (_, fieldName) => {
    const value = item[fieldName];

    // Return empty string for null/undefined, otherwise convert to string
    if (value === null || value === undefined) {
      return "";
    }

    return String(value);
  });

  // Clean up orphaned separators
  const escapedSeparator = separator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Iteratively clean up until stable
  let previousResult = "";
  while (previousResult !== result) {
    previousResult = result;
    // Remove leading separator
    result = result.replace(new RegExp(`^${escapedSeparator}`), "");
    // Remove trailing separator
    result = result.replace(new RegExp(`${escapedSeparator}$`), "");
    // Replace multiple consecutive separators with single one
    result = result.replace(
      new RegExp(`${escapedSeparator}${escapedSeparator}+`, "g"),
      separator
    );
  }

  return result.trim();
}

/**
 * Default fallback chain for tables without configured display rules.
 */
function getDefaultDisplayText(item: Record<string, unknown>): string {
  return (
    (item.bezeichnung as string) ||
    (item.name as string) ||
    (item.pk as string) ||
    (item.groesse as string) ||
    (item.lichtfarbe as string) ||
    (item.unterhalt_mast as string) ||
    (item.unterhaltspflichtiger_leuchte as string) ||
    (item.strasse as string) ||
    (item.energielieferant as string) ||
    (item.bezirk as string) ||
    (item.beschreibung as string) ||
    (item.kennziffer as string) ||
    (item.mastart as string) ||
    (item.klassifizierung as string) ||
    (item.masttyp as string) ||
    "Neuer Eintrag"
  );
}

/**
 * Gets the display text for a key table item based on configuration.
 *
 * @param item - The item to display
 * @param tableName - The key of the table
 * @param config - The display configuration object
 * @returns The formatted display string
 */
export function getItemDisplayText(
  item: Record<string, unknown>,
  tableName: string,
  config: KeyTableDisplayConfig
): string {
  const rule = config[tableName];

  if (!rule) {
    // Use default fallback chain for unconfigured tables
    return getDefaultDisplayText(item);
  }

  const result = parseTemplate(rule.template, item, rule.separator);

  // Return emptyText if result is empty, otherwise return result
  if (!result || result.trim() === "") {
    return rule.emptyText ?? "";
  }

  return result;
}
