// prevent namespace collisions with other mapping libraries and JavaScript built-in Map type
import { Map as LeafletMap } from "leaflet";

export { LeafletMap };

export const isLeafletMap = (map: unknown): map is LeafletMap => {
  return map instanceof LeafletMap;
};
