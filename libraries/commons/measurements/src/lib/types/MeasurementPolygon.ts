import { Polygon } from "@carma/leaflet";

export interface MeasurementPolygon extends Omit<Polygon, "customID"> {
  customID?: number | string | symbol;
  customShape?: string;
  customHandle?: number;
  _path?: SVGPathElement;
  enableEdit?: () => void;
  disableEdit?: () => void;
}
