import { useCallback, useEffect, useRef, useState } from "react";
import type { StyleSpecification } from "maplibre-gl";
import { STYLE_RESOURCE_TIMEOUT_MS } from "../utils/fetch-style-resource";

/** First composition may delay creation, but cannot leave the map unmounted. */
export const useInitialMapStyle = ({
  backgroundStyle,
  defer,
  layerMode,
}: {
  backgroundStyle: StyleSpecification;
  defer: boolean;
  layerMode: "merged" | "imperative";
}) => {
  const [initialStyle, setInitialStyle] = useState<StyleSpecification | null>(
    null
  );
  const background = useRef(backgroundStyle);
  useEffect(() => {
    background.current = backgroundStyle;
  }, [backgroundStyle]);

  // Late composition applies to the live map; it must not recreate the map.
  const completeInitialStyle = useCallback((style: StyleSpecification) => {
    setInitialStyle((current) => current ?? style);
  }, []);

  useEffect(() => {
    if (!defer || initialStyle) return;
    if (layerMode === "imperative") {
      completeInitialStyle(background.current);
      return;
    }
    const timer = setTimeout(
      () => completeInitialStyle(background.current),
      STYLE_RESOURCE_TIMEOUT_MS
    );
    return () => clearTimeout(timer);
  }, [defer, initialStyle, layerMode, completeInitialStyle]);

  return { initialStyle, completeInitialStyle };
};
