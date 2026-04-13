import {
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-appframeworks/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useCallback, useContext, useRef } from "react";
import { isAreaType } from "@carma-commons/resources";
import proj4 from "proj4";
import { proj4crs3857def, proj4crs4326def } from "@carma-mapping/utils";
import L from "leaflet";

const IDLE_POLL_INTERVAL_MS = 20;
const IDLE_POLL_TIMEOUT_MS = 5000;

const FuzzySearchWrapper = ({
  featureGazData,
  placeholder,
  clickAfterGazetteerHit = true,
  layersIdleRef,
  resetLayersIdle,
  landParcelSearch = false,
}) => {
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );

  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap;
  const { gazData } = useGazData();
  const commonGazData = [...featureGazData, ...gazData];

  const { setSelection } = useSelection();
  const { routedMapRef: routedMap } = useSelectionTopicMap() ?? {};
  const pendingClickRef = useRef(null);

  const fireClickOnMap = useCallback(
    (selection) => {
      const map = routedMap?.leafletMap?.leafletElement;
      if (!map) return;

      const selectedPos = proj4(proj4crs3857def, proj4crs4326def, [
        selection.x,
        selection.y,
      ]);
      const updatedPos = { lat: selectedPos[1], lng: selectedPos[0] };
      const latlngPoint = L.latLng(updatedPos);

      map.fireEvent("click", {
        latlng: latlngPoint,
        layerPoint: map.latLngToLayerPoint(latlngPoint),
        containerPoint: map.latLngToContainerPoint(latlngPoint),
      });
    },
    [routedMap]
  );

  const waitForIdleThenClick = useCallback(
    (selection) => {
      // Clear any pending poll from a previous selection
      if (pendingClickRef.current) {
        clearTimeout(pendingClickRef.current);
        pendingClickRef.current = null;
      }

      if (resetLayersIdle) {
        resetLayersIdle();
      }

      const startTime = Date.now();

      const poll = () => {
        if (layersIdleRef?.current) {
          pendingClickRef.current = null;
          fireClickOnMap(selection);
          return;
        }

        if (Date.now() - startTime > IDLE_POLL_TIMEOUT_MS) {
          console.warn(
            "[GAZETTEER] Layers did not become idle within timeout, firing click anyway"
          );
          pendingClickRef.current = null;
          fireClickOnMap(selection);
          return;
        }

        pendingClickRef.current = setTimeout(poll, IDLE_POLL_INTERVAL_MS);
      };

      poll();
    },
    [layersIdleRef, fireClickOnMap, resetLayersIdle]
  );

  const onGazetteerSelection = (selection) => {
    if (!selection) {
      setSelection(null);
      return;
    }
    const selectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
    if (routedMap && clickAfterGazetteerHit) {
      if (layersIdleRef) {
        waitForIdleThenClick(selection);
      } else {
        // Fallback if no idle tracking is available
        fireClickOnMap(selection);
      }
    }
  };

  return (
    <>
      {gazData.length > 0 && (
        <>
          <LibFuzzySearch
            gazData={commonGazData}
            onSelection={onGazetteerSelection}
            pixelwidth={pixelwidth}
            placeholder={placeholder || "Wohin?"}
            landParcelSearch={landParcelSearch}
          />
        </>
      )}
    </>
  );
};

export default FuzzySearchWrapper;
