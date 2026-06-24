// MapFish print job submission. Engine-agnostic: it only needs a PrintJob.

import { getFromWebMercatorToWGS84 } from "@carma-geo/proj";

import { getMercatorScale } from "./scale";
import type { Orientation, PrintJob } from "./types";

const MAPFISH_BASE = "https://mapfish.cismet.de/print";

const getOrientationTemplateParams = (orientation: Orientation = "portrait") => ({
  url:
    orientation === "portrait"
      ? `${MAPFISH_BASE}/A4_Portrait/buildreport.pdf`
      : `${MAPFISH_BASE}/A4_Landscape/buildreport.pdf`,
  title: orientation === "portrait" ? "A4 portrait" : "A4 landscape",
});

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes("Mac") && "ontouchend" in document);

export interface PrintMapHandlers {
  onLoading?: (loading: boolean) => void;
  onError?: (message: string) => void;
}

/**
 * Build the MapFish payload from a PrintJob, POST it, and open / download the
 * resulting PDF. The preview rectangle cleanup is the engine's responsibility
 * (it owns the rectangle); this function only does the network round-trip.
 */
export const printMap = async (
  job: PrintJob,
  handlers: PrintMapHandlers = {}
): Promise<void> => {
  const { center, scale, orientation, dpi, layers, name } = job;
  const { url, title } = getOrientationTemplateParams(orientation);
  const latLng = getFromWebMercatorToWGS84(center);

  const data = {
    layout: title,
    attributes: {
      keywordsAtt: ["map", "example", "metadata"],
      displayedScale: scale,
      map: {
        center,
        rotation: 0,
        longitudeFirst: true,
        layers,
        scale: getMercatorScale(scale, latLng[1]),
        projection: "EPSG:3857",
        dpi,
      },
    },
  };

  handlers.onLoading?.(true);

  try {
    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const blob = await response.blob();
    const urlBlob = URL.createObjectURL(blob);

    if (!isIOS()) {
      window.open(urlBlob);
    } else {
      const a = document.createElement("a");
      a.href = urlBlob;
      a.download = name ?? "print.pdf";
      a.click();
    }

    handlers.onLoading?.(false);
  } catch (error) {
    handlers.onLoading?.(false);
    handlers.onError?.(
      error instanceof Error ? error.message : "An unexpected error occurred"
    );
  }
};
