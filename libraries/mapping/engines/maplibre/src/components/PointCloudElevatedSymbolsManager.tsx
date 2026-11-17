import { useEffect, useRef } from "react";

import { useLibreContext } from "../contexts/LibreContext";
import { MAPLIBRE_EVENT } from "../constants/mapEvents";
import {
  isPointCloudZoomInRange,
  type PointCloudLayerConfig,
} from "../lib/core/pointcloud-style-config";
import {
  startPointCloudElevatedSymbols,
  type PointCloudElevatedSymbols,
} from "../lib/runtime/integrations/pointcloud-elevated-symbols-runtime";

// ─────────────────────────────────────────────────────────────
//  PointCloudElevatedSymbolsManager: lifts symbol layers that carry
//  `pointcloudElevation` onto the point cloud while one is drawn.
//
//  Mounted only when the style names a point cloud. A hidden cloud (the
//  `pointcloud-visibility` toggle) or one outside its zoom range turns the
//  lift off, and the layers are plain 2D symbols again.
// ─────────────────────────────────────────────────────────────

export interface PointCloudElevatedSymbolsManagerProps {
  pointClouds: readonly PointCloudLayerConfig[];
}

function mapIsUsable(map: unknown): boolean {
  const candidate = map as { _removed?: boolean; style?: unknown } | null;
  return !!candidate && !candidate._removed && !!candidate.style;
}

export function PointCloudElevatedSymbolsManager({
  pointClouds,
}: PointCloudElevatedSymbolsManagerProps) {
  const { map } = useLibreContext();
  const handleRef = useRef<PointCloudElevatedSymbols | null>(null);
  const pointCloudsRef = useRef(pointClouds);
  pointCloudsRef.current = pointClouds;

  const gateRef = useRef(() => {});
  gateRef.current = () => {
    if (!map || !handleRef.current || !mapIsUsable(map)) return;
    const zoom = map.getZoom();
    handleRef.current.setActive(
      pointCloudsRef.current.some(
        (config) => config.visible && isPointCloudZoomInRange(config, zoom)
      )
    );
  };

  useEffect(() => {
    if (!map || !mapIsUsable(map)) return;
    const handle = startPointCloudElevatedSymbols(map);
    handleRef.current = handle;
    const gate = () => gateRef.current();
    gate();
    map.on(MAPLIBRE_EVENT.MOVE, gate);
    return () => {
      map.off(MAPLIBRE_EVENT.MOVE, gate);
      handleRef.current = null;
      handle.dispose();
    };
  }, [map]);

  useEffect(() => {
    gateRef.current();
  }, [pointClouds]);

  return null;
}

export default PointCloudElevatedSymbolsManager;
