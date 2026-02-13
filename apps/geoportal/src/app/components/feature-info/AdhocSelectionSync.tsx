import { useAdhocFeatureDisplay } from "@carma-appframeworks/portals";
import { useEffect, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { useDispatch } from "react-redux";
import { setTriggerSelectionById } from "../../store/slices/features";

interface SelectedFeatureState {
  source: string;
  id: number | string;
  layerId: string;
}

const AdhocSelectionSync = ({
  maplibreMapsRef,
}: {
  maplibreMapsRef: React.MutableRefObject<Map<string, MaplibreMap>>;
}) => {
  const dispatch = useDispatch();
  const selectedFeatures = useRef(new Set<SelectedFeatureState>());
  const { onSelectionChange } = useAdhocFeatureDisplay();

  useEffect(() => {
    const unsubscribe = onSelectionChange((selection) => {
      selectedFeatures.current.forEach((feature) => {
        const map = maplibreMapsRef?.current?.get(feature.layerId);
        if (map) {
          map.setFeatureState(feature, { selected: false });
        }
      });
      selectedFeatures.current.clear();

      if (selection && maplibreMapsRef) {
        const layerId = selection.collectionId;
        const map = maplibreMapsRef.current.get(layerId);
        if (map) {
          const style = map.getStyle();
          if (style?.sources) {
            for (const sourceKey in style.sources) {
              try {
                const sourceLayers = [
                  ...new Set(
                    style.layers
                      ?.filter(
                        // @ts-ignore
                        (l) => l.source === sourceKey && l["source-layer"]
                      )
                      .map((l) => l["source-layer"])
                  ),
                ];

                const featureId = selection.feature.id;

                if (sourceLayers.length > 0) {
                  for (const sourceLayer of sourceLayers) {
                    map.setFeatureState(
                      { source: sourceKey, sourceLayer, id: featureId },
                      { selected: true }
                    );
                    selectedFeatures.current.add({
                      source: sourceKey,
                      id: featureId,
                      layerId,
                    });
                  }
                } else {
                  map.setFeatureState(
                    { source: sourceKey, id: featureId },
                    { selected: true }
                  );
                  selectedFeatures.current.add({
                    source: sourceKey,
                    id: featureId,
                    layerId,
                  });
                }
              } catch (e) {}
            }
          }
        } else {
          dispatch(setTriggerSelectionById(layerId));
        }
      }
    });
    return unsubscribe;
  }, [onSelectionChange]);

  return null;
};

export default AdhocSelectionSync;
