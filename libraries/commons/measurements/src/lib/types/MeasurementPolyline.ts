import { Polyline } from "@carma/leaflet";

export interface MeasurementPolyline extends Omit<Polyline, "customID"> {
  customID?: number | string | symbol;
  customShape?: string;
  _path?: SVGPathElement;
  _leaflet_id?: number;
  enableEdit?: () => void;
  disableEdit?: () => void;
}
