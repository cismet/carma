/**
 * Single source of truth for Arbeitsprotokoll-status color coding.
 *
 * Consumers (map overlay, AA sidebar progress bar, legend, infobox header,
 * …) all import from here. To retune the palette, edit the RGB values or
 * the labels below and every surface updates together.
 */

export const STATUS_KEYS = [
  "offen",
  "in_bearbeitung",
  "erledigt",
  "fehlmeldung",
] as const;

export type StatusKey = (typeof STATUS_KEYS)[number];

/** Base RGB components per status. Consumers choose the alpha at the call site. */
export const STATUS_RGB: Record<StatusKey, readonly [number, number, number]> =
  {
    offen: [245, 158, 11],
    // cyan (Tailwind cyan-500) — picked to stay clear of the selection blue.
    in_bearbeitung: [6, 182, 212],
    erledigt: [16, 185, 129],
    fehlmeldung: [239, 68, 68],
  };

/** Fallback used when a feature has no recognized status. */
export const STATUS_FALLBACK_RGB = [156, 163, 175] as const;

/** German labels for UI display (progress bar tooltips, legend, etc.). */
export const STATUS_LABELS: Record<StatusKey, string> = {
  offen: "Offen",
  in_bearbeitung: "In Bearbeitung",
  erledigt: "Erledigt",
  fehlmeldung: "Fehlmeldung",
};

const toHex = (v: number) => v.toString(16).padStart(2, "0");

/** `rgba(r, g, b, a)` string for a known status. */
export const statusRgba = (key: StatusKey, alpha: number): string => {
  const [r, g, b] = STATUS_RGB[key];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** `rgba(r, g, b, a)` for features without a recognized status. */
export const statusFallbackRgba = (alpha: number): string => {
  const [r, g, b] = STATUS_FALLBACK_RGB;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Fully-opaque `#rrggbb` — use for infobox header backgrounds etc. */
export const statusHex = (key: StatusKey): string => {
  const [r, g, b] = STATUS_RGB[key];
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

/** Fully-opaque `#rrggbb` fallback for unknown status. */
export const statusFallbackHex = (): string => {
  const [r, g, b] = STATUS_FALLBACK_RGB;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

/**
 * Map an `arbeitsprotokollstatus.bezeichnung` string to one of the four known
 * status keys. A null/empty bezeichnung is the canonical representation of
 * "offen" in this system (matches the filter semantics in constants/queries.ts
 * where `fk_status IS NULL || schluessel = "0"` selects offen). Returns `null`
 * for a recognized-but-unknown label (e.g. a new status that isn't yet mapped).
 */
export function resolveStatusKey(
  bezeichnung: string | null | undefined
): StatusKey | null {
  if (!bezeichnung) return "offen";
  const b = String(bezeichnung).toLowerCase();
  if (b.includes("offen")) return "offen";
  if (b.includes("bearbeitung")) return "in_bearbeitung";
  if (b.includes("erledigt")) return "erledigt";
  if (b.includes("fehl")) return "fehlmeldung";
  return null;
}
