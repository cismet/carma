import { Layer, LatLng } from "@carma/leaflet";

export interface MeasurementLayer extends Omit<Layer, "customID"> {
  customID?: number | string | symbol;
  customHandle?: number;
  _path?: SVGPathElement;
  enableEdit?: () => void;
  disableEdit?: () => void;
  getLatLng?: () => LatLng;
  _leaflet_id?: number;
}
