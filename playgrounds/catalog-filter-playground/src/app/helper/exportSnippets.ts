import {
  toCatalogFilterGroups,
  type CatalogFilter,
  type CatalogFilters,
} from "@carma-mapping/layers";

import type { RouteDraft } from "../model";

const UMLAUT_REPLACEMENTS: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "Ae",
  Ö: "Oe",
  Ü: "Ue",
  ß: "ss",
};

/** derives a JS identifier prefix from the route path ("bad-luft" -> badLuft) */
export const toIdentifier = (path: string): string => {
  const ascii = path.replace(/[äöüÄÖÜß]/g, (char) => UMLAUT_REPLACEMENTS[char]);
  const parts = ascii.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) {
    return "neuer";
  }
  const [first, ...rest] = parts;
  const camel =
    first.toLowerCase() +
    rest.map((part) => part[0].toUpperCase() + part.slice(1)).join("");
  return /^[0-9]/.test(camel) ? `route${camel}` : camel;
};

const quote = (value: string) => JSON.stringify(value);

const inlineValues = (values: string[]) => values.map(quote).join(", ");

const isShort = (values: string[]) =>
  values.length <= 3 && inlineValues(values).length <= 48;

const emitFilterLines = (
  filter: CatalogFilter,
  indent: string,
  hoistedFilter: CatalogFilter | undefined,
  idsConstName: string
): string[] => {
  if (filter === hoistedFilter) {
    return [`${indent}{ field: "id", values: ${idsConstName} },`];
  }
  if (isShort(filter.values)) {
    return [
      `${indent}{ field: ${quote(filter.field)}, values: [${inlineValues(
        filter.values
      )}] },`,
    ];
  }
  return [
    `${indent}{`,
    `${indent}  field: ${quote(filter.field)},`,
    `${indent}  values: [`,
    ...filter.values.map((value) => `${indent}    ${quote(value)},`),
    `${indent}  ],`,
    `${indent}},`,
  ];
};

/**
 * A complete module in the style of gesundheit.ts: a hoisted ids const for
 * the first larger id filter, the FachzwillingRoute export and a reminder to
 * register the route. A single filter group exports flat, several groups
 * export as nested OR-combined arrays.
 */
export const buildTypeScriptExport = (
  route: RouteDraft,
  filters: CatalogFilters
): string => {
  const name = toIdentifier(route.path);
  const groups = toCatalogFilterGroups(filters);
  const lines: string[] = [
    'import type { FachzwillingRoute } from "./fachzwillinge";',
    "",
  ];

  const idsConstName = `${name}ItemIds`;
  const hoistedFilter = groups
    .flat()
    .find((filter) => filter.field === "id" && !isShort(filter.values));
  if (hoistedFilter) {
    lines.push(`const ${idsConstName} = [`);
    hoistedFilter.values.forEach((value) => lines.push(`  ${quote(value)},`));
    lines.push("];", "");
  }

  lines.push(`export const ${name}Fachzwilling: FachzwillingRoute = {`);
  lines.push(`  path: ${quote(route.path)},`);
  lines.push(`  title: ${quote(route.title)},`);
  if (route.description.trim()) {
    lines.push(`  description:`);
    lines.push(`    ${quote(route.description.trim())},`);
  }
  if (groups.length === 0) {
    lines.push("  filters: [],");
  } else if (groups.length === 1) {
    lines.push("  filters: [");
    groups[0].forEach((filter) =>
      lines.push(...emitFilterLines(filter, "    ", hoistedFilter, idsConstName))
    );
    lines.push("  ],");
  } else {
    lines.push("  filters: [");
    groups.forEach((group) => {
      lines.push("    [");
      group.forEach((filter) =>
        lines.push(
          ...emitFilterLines(filter, "      ", hoistedFilter, idsConstName)
        )
      );
      lines.push("    ],");
    });
    lines.push("  ],");
  }
  lines.push("};");
  lines.push("");
  lines.push("// Registrierung in fachzwillinge.ts:");
  lines.push(
    `// export const fachzwillingRoutes: FachzwillingRoute[] = [..., ${name}Fachzwilling];`
  );

  return lines.join("\n");
};

export const buildJsonExport = (
  route: RouteDraft,
  filters: CatalogFilters
): string =>
  JSON.stringify(
    {
      path: route.path,
      title: route.title,
      ...(route.description.trim()
        ? { description: route.description.trim() }
        : {}),
      filters,
    },
    null,
    2
  );
