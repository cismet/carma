import { useEffect, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

import {
  ELEVATION_COLOR_DATUM,
  type ElevationColorDatum,
} from "./reference-elevation-shader";
import {
  sampleGcg2016Field,
  type Gcg2016ShaderField,
} from "./reference-gcg2016-field";
import {
  referenceMountDrop,
  type ReferenceFrame,
} from "./reference-surface-frame";

type MetricRangeOptions = Readonly<{
  autoMetricRange?: boolean;
  elevationColorDatum?: ElevationColorDatum;
}>;

export const useReferenceMetricRange = (
  map: MapLibreMap | null,
  frame: ReferenceFrame,
  gcgField: Gcg2016ShaderField | null,
  options: MetricRangeOptions
) => {
  const [metricRange, setMetricRange] = useState<
    readonly [number, number] | null
  >(null);
  useEffect(() => {
    const datum = options.elevationColorDatum;
    if (
      !map ||
      !gcgField ||
      !options.autoMetricRange ||
      (datum !== ELEVATION_COLOR_DATUM.DATUM_DIFFERENCE &&
        datum !== ELEVATION_COLOR_DATUM.UNDULATION &&
        datum !== ELEVATION_COLOR_DATUM.MOUNT_DROP)
    ) {
      setMetricRange(null);
      return;
    }
    const update = () => {
      const { clientWidth: width, clientHeight: height } = map.getCanvas();
      if (!width || !height) return;
      const anchorUndulation = sampleGcg2016Field(
        gcgField,
        frame,
        ...frame.originLngLat
      );
      let minimum = Infinity;
      let maximum = -Infinity;
      // 17×17 samples of the map's ground footprint, not the full cached tile
      // extent. Bounded and only on moveend/resize; no I/O, mesh traversal or
      // GPU readback. The legend explicitly labels this as sampled coverage.
      for (let y = 0; y <= 16; y++) {
        for (let x = 0; x <= 16; x++) {
          const { lng, lat } = map.unproject([
            (width * x) / 16,
            (height * y) / 16,
          ]);
          const value =
            datum === ELEVATION_COLOR_DATUM.MOUNT_DROP
              ? referenceMountDrop(frame, lng, lat)
              : sampleGcg2016Field(gcgField, frame, lng, lat) -
                (datum === ELEVATION_COLOR_DATUM.DATUM_DIFFERENCE
                  ? anchorUndulation
                  : 0);
          if (Number.isFinite(value)) {
            minimum = Math.min(minimum, value);
            maximum = Math.max(maximum, value);
          }
        }
      }
      if (!Number.isFinite(minimum)) return;
      if (maximum - minimum < 0.001) {
        const center = (minimum + maximum) / 2;
        minimum = center - 0.0005;
        maximum = center + 0.0005;
      }
      setMetricRange((previous) =>
        previous &&
        Math.abs(previous[0] - minimum) < 1e-6 &&
        Math.abs(previous[1] - maximum) < 1e-6
          ? previous
          : [minimum, maximum]
      );
    };
    update();
    map.on("moveend", update);
    map.on("resize", update);
    return () => {
      map.off("moveend", update);
      map.off("resize", update);
    };
  }, [
    map,
    frame,
    gcgField,
    options.autoMetricRange,
    options.elevationColorDatum,
  ]);
  return metricRange;
};
