import { useEffect, useMemo, useState } from "react";

import {
  createSymbolBadgeRenderer,
  type SymbolBadgeDimension,
} from "@carma-commons/ui/components";

import { useVorhabenItems } from "../../../data/vorhabenItems";
import type { VorhabenFeatureProperties } from "../../../data/vorhabenGeoJson";
import { host } from "../../../constants/constants";

const SIGNATURE_BASE_URL = host + "/poi-signaturen/vorhaben/";

/**
 * Signature of the first Vorhaben as the live Leaflet map showed it, used
 * until the real one is loaded or when loading fails. The `bg-fill` and
 * `fg-fill` classes are what the badge renderer colours.
 */
const FALLBACK_SYMBOL = {
  svgMarkup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <rect class="bg-fill" fill="#e2923b" x="0" y="0" rx="3.3" ry="3.3" width="24" height="24"></rect>
  <rect class="fg-fill" fill="#FFFFFF" x="3.9" y="7.94" width="16.19" height="1.02" rx=".5" ry=".5"></rect>
  <path class="fg-fill" fill="#FFFFFF" d="M11.87,2.38L2.64,6.64c-.28.13-.19.55.12.55h18.46c.31,0,.4-.42.12-.55L12.11,2.38c-.07-.04-.17-.04-.24,0Z"></path>
  <rect class="fg-fill" fill="#FFFFFF" x="4.92" y="9.66" width="1.86" height="7.84"></rect>
  <rect class="fg-fill" fill="#FFFFFF" x="13.14" y="9.67" width="1.86" height="7.84"></rect>
  <rect class="fg-fill" fill="#FFFFFF" x="9.02" y="9.66" width="1.86" height="7.84"></rect>
  <rect class="fg-fill" fill="#FFFFFF" x="17.41" y="9.67" width="1.86" height="7.84"></rect>
  <polygon class="fg-fill" fill="#FFFFFF" points="20.98 20.35 2.81 20.35 3.67 18.19 20.14 18.19 20.98 20.35"></polygon>
</svg>`,
  dimension: { width: 24, height: 24 } as SymbolBadgeDimension,
  color: "#e2923b",
};

interface LoadedSymbol {
  svgMarkup: string;
  dimension: SymbolBadgeDimension;
}

/** The signature file names convertItemToFeature derived for an item, in
 *  order of preference (BuGa variant first when the item is one). */
const signatureCandidates = ({
  thema_signatur,
  buga,
}: VorhabenFeatureProperties): string[] => {
  const base =
    thema_signatur === "Icon_Verkehr" ? "Icon_Mobilitaet" : thema_signatur;
  const candidates = buga ? [base.replace(/^Icon_/, "Icon_BuGa_")] : [];
  candidates.push(base);
  return candidates.map((name) => `${name}.svg`);
};

/** The infobox header colour the old converter used for the theme colour */
const adjustFeatureColor = (color: string) =>
  color === "#de0000" ? "#CF4647" : color;

const fetchSignature = async (fileName: string): Promise<LoadedSymbol> => {
  const response = await fetch(SIGNATURE_BASE_URL + fileName);
  if (!response.ok) {
    throw new Error(`signature ${fileName}: ${response.status}`);
  }
  const svgMarkup = await response.text();
  const root = new DOMParser().parseFromString(
    svgMarkup,
    "application/xml"
  ).documentElement;
  if (root.tagName !== "svg") {
    throw new Error(`signature ${fileName}: not an svg`);
  }
  return {
    svgMarkup,
    dimension: {
      width: Number(root.getAttribute("width")) || FALLBACK_SYMBOL.dimension.width,
      height:
        Number(root.getAttribute("height")) || FALLBACK_SYMBOL.dimension.height,
    },
  };
};

/**
 * Symbol for the settings panel's symbol size slider: the signature of the
 * first loaded Vorhaben in its theme colour, like react-cismap took
 * `allFeatures[0].properties.svgBadge`. Falls back to a built-in signature
 * while loading or if the asset server does not answer.
 */
export const useVorhabenSymbolBadge = () => {
  const { items } = useVorhabenItems();
  const first = items[0]?.properties;
  const [loaded, setLoaded] = useState<LoadedSymbol | null>(null);

  const candidates = useMemo(
    () => (first ? signatureCandidates(first) : []),
    [first]
  );

  useEffect(() => {
    if (candidates.length === 0) {
      return;
    }
    let cancelled = false;
    (async () => {
      for (const fileName of candidates) {
        try {
          const symbol = await fetchSignature(fileName);
          if (!cancelled) {
            setLoaded(symbol);
          }
          return;
        } catch (error) {
          console.warn("[VORHABEN SYMBOL]", error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidates]);

  return useMemo(
    () =>
      createSymbolBadgeRenderer({
        svgMarkup: loaded?.svgMarkup ?? FALLBACK_SYMBOL.svgMarkup,
        dimension: loaded?.dimension ?? FALLBACK_SYMBOL.dimension,
        color: first ? adjustFeatureColor(first.thema_farbe) : FALLBACK_SYMBOL.color,
      }),
    [loaded, first]
  );
};
