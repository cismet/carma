import { LeafletMap } from "@carma/leaflet";
import envelope from "@turf/envelope";
import type { BBox } from "@turf/helpers";

import { getCoordinates } from "@carma/geo/utils";

export const zoomToFeature = (
  selectedFeature: any,
  routedMapRef: {
    leafletMap: {
      leafletElement: LeafletMap;
    };
  },
  padding: [number, number] = [0, 0]
) => {
  if (selectedFeature.properties?.wmsProps?.bounds) {
    const bbox: BBox = JSON.parse(selectedFeature.properties.wmsProps.bounds);
    if (routedMapRef) {
      routedMapRef.leafletMap.leafletElement.fitBounds(
        [
          [bbox[3], bbox[2]],
          [bbox[1], bbox[0]],
        ],
        {
          padding: padding,
        }
      );
    }
  } else if (selectedFeature.geometry) {
    const type = selectedFeature.geometry.type;
    if (type === "Point") {
      const coordinates = getCoordinates(selectedFeature.geometry);

      if (routedMapRef) {
        routedMapRef.leafletMap.leafletElement.setView(
          [coordinates[1], coordinates[0]],
          selectedFeature.properties.zoom ? selectedFeature.properties.zoom : 20
        );
      }
    } else {
      const bbox = envelope(selectedFeature.geometry).bbox;

      if (routedMapRef) {
        routedMapRef.leafletMap.leafletElement.fitBounds(
          [
            [bbox[3], bbox[2]],
            [bbox[1], bbox[0]],
          ],
          {
            padding: padding,
          }
        );
      }
    }
  }
};
