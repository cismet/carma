import type { AdvancedFilterState } from "@carma-mapping/components";

const STORAGE_KEY = "ng-stadtplan-filter";

export function readFilterFromStorage(
  validCategories: string[]
): AdvancedFilterState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const stored = JSON.parse(raw) as {
      positiv?: string[];
      negativ?: string[];
    };

    if (!stored || typeof stored !== "object") return null;

    const valid = new Set(validCategories);

    const positiv = Array.isArray(stored.positiv)
      ? stored.positiv.filter((s) => typeof s === "string" && valid.has(s))
      : [];

    const negativ = Array.isArray(stored.negativ)
      ? stored.negativ.filter((s) => typeof s === "string" && valid.has(s))
      : [];

    return { positiv, negativ };
  } catch {
    return null;
  }
}

export function writeFilterToStorage(
  state: AdvancedFilterState,
  allCategories: string[]
): void {
  const isDefault =
    state.negativ.length === 0 && state.positiv.length === allCategories.length;

  if (isDefault) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ positiv: state.positiv, negativ: state.negativ })
    );
  }
}
