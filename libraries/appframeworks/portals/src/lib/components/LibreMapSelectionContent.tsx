import { useEffect, useState } from "react";
import { useSelection } from "./SelectionProvider";
import maplibregl from "maplibre-gl";
import proj4 from "proj4";
import { proj4crs3857def, proj4crs4326def } from "@carma-mapping/utils";

interface SelectionContentProps {
  map: maplibregl.Map;
}

export const LibreMapSelectionContent = ({ map }: SelectionContentProps) => {
  const [marker, setMarker] = useState<maplibregl.Marker | undefined>();
  const { selection, overlayFeature } = useSelection();

  useEffect(() => {
    marker?.remove();
    if (selection) {
      if (selection.isAreaSelection) {
      } else {
        const pos = proj4(proj4crs3857def, proj4crs4326def, [
          selection.x,
          selection.y,
        ]);
        setMarker(
          new maplibregl.Marker().setLngLat([pos[0], pos[1]]).addTo(map)
        );
      }
    }
  }, [selection]);

  if (selection?.isAreaSelection) {
    return overlayFeature && <></>;
  } else {
    return <></>;
  }
};
