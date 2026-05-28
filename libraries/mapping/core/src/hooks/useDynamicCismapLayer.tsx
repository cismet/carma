import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type maplibregl from "maplibre-gl";
import type { DynamicStylingOptionsConfig } from "@carma-mapping/layers";
import {
  applyDynamicStyling,
  getLastAppliedSelection,
  setLastAppliedSelection,
} from "@carma-mapping/components";
import { useDynamicStyling } from "./useDynamicStyling";

export interface UseDynamicCismapLayerProps {
  layerId: string;
  styleUrl: string;
  configs?: DynamicStylingOptionsConfig[];
  opacity?: number;
  selectorIcon?: (
    config: DynamicStylingOptionsConfig,
    selection: string,
    configIndex: number
  ) => ReactNode;
}

export interface CismapVectorLayerProps {
  type: "vector";
  style: string;
  opacity: number;
  onMapLibreCoreMapReady: (map: maplibregl.Map) => void;
}

export interface UseDynamicCismapLayerResult {
  cismapLayerProps: CismapVectorLayerProps;
  selectors: ReactNode[];
  configs: DynamicStylingOptionsConfig[];
  selections: Record<number, string>;
  setSelection: (configIndex: number, selection: string) => void;
}

export const useDynamicCismapLayer = ({
  layerId,
  styleUrl,
  configs: providedConfigs,
  opacity = 1,
  selectorIcon,
}: UseDynamicCismapLayerProps): UseDynamicCismapLayerResult => {
  const { configs, selections, setSelection, selectors } = useDynamicStyling({
    layerId,
    styleUrl,
    configs: providedConfigs,
    selectorIcon,
  });

  const maplibreMapRef = useRef<maplibregl.Map | null>(null);
  const [mapReadyCount, setMapReadyCount] = useState(0);

  const applyCurrentSelections = useCallback(() => {
    const maplibreMap = maplibreMapRef.current;
    if (!maplibreMap || !configs.length) {
      return;
    }
    configs.forEach((config, configIndex) => {
      const currentSelection = selections[configIndex] ?? config.default;
      const lastAppliedSelection =
        getLastAppliedSelection(layerId, configIndex) ?? config.default;
      if (currentSelection === lastAppliedSelection) {
        return;
      }
      applyDynamicStyling(maplibreMap, layerId, config, currentSelection);
      setLastAppliedSelection(layerId, configIndex, currentSelection);
    });
  }, [configs, selections, layerId]);

  useEffect(() => {
    applyCurrentSelections();
  }, [applyCurrentSelections, mapReadyCount]);

  const onMapLibreCoreMapReady = useCallback((maplibreMap: maplibregl.Map) => {
    maplibreMapRef.current = maplibreMap;
    setMapReadyCount((previousCount) => previousCount + 1);
  }, []);

  const cismapLayerProps = useMemo<CismapVectorLayerProps>(
    () => ({
      type: "vector",
      style: styleUrl,
      opacity,
      onMapLibreCoreMapReady,
    }),
    [styleUrl, opacity, onMapLibreCoreMapReady]
  );

  return {
    cismapLayerProps,
    selectors,
    configs,
    selections,
    setSelection,
  };
};
