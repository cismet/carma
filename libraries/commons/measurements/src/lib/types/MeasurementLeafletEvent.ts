import { LeafletEvent, LayerGroup } from "@carma/leaflet";

export interface MeasurementLeafletEvent extends LeafletEvent {
  layerType?: string;
  layers?: LayerGroup;
}
