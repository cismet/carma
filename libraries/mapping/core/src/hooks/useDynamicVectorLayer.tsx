import { useMemo, type ReactNode } from "react";
import type { DynamicStylingOptionsConfig } from "@carma-mapping/layers";
import { applyDynamicStylingToStylesheet } from "@carma-mapping/components";
import type { LibreLayer, VectorStyle } from "@carma-mapping/engines/maplibre";
import { useDynamicStyling } from "./useDynamicStyling";

export interface UseDynamicVectorLayerProps {
  layerId: string;
  styleUrl?: string;
  style?: any;
  configs?: DynamicStylingOptionsConfig[];
  opacity?: number;
  selectorIcon?: (
    config: DynamicStylingOptionsConfig,
    selection: string,
    configIndex: number
  ) => ReactNode;
}

export interface UseDynamicVectorLayerResult {
  libreLayer: LibreLayer | null;
  selectors: ReactNode[];
  configs: DynamicStylingOptionsConfig[];
  selections: Record<number, string>;
  setSelection: (configIndex: number, selection: string) => void;
}

export const useDynamicVectorLayer = ({
  layerId,
  styleUrl,
  style,
  configs: providedConfigs,
  opacity,
  selectorIcon,
}: UseDynamicVectorLayerProps): UseDynamicVectorLayerResult => {
  const { configs, selections, setSelection, selectors } = useDynamicStyling({
    layerId,
    styleUrl,
    style,
    configs: providedConfigs,
    selectorIcon,
  });

  const libreLayer = useMemo<LibreLayer | null>(() => {
    const styleSource = style ?? styleUrl;
    if (!styleSource) {
      return null;
    }
    const configsWithSelection = configs.map((config, configIndex) => ({
      config,
      configIndex,
      selection: selections[configIndex] ?? config.default,
    }));
    const configsWithChangedSelection = configsWithSelection.filter(
      ({ config, selection }) => selection !== config.default
    );
    const userStyleTransform =
      configsWithChangedSelection.length > 0
        ? (inputStyle: any) => {
            let transformedStyle = inputStyle;
            for (const { config, selection } of configsWithChangedSelection) {
              const nextStyle = applyDynamicStylingToStylesheet(
                transformedStyle,
                layerId,
                config,
                selection
              );
              if (nextStyle) {
                transformedStyle = nextStyle;
              }
            }
            return transformedStyle;
          }
        : undefined;
    const userStyleTransformKey = configsWithSelection
      .map(({ selection }) => selection)
      .join("|");
    const vectorLayer: VectorStyle = {
      name: layerId,
      style: styleSource,
      ...(opacity !== undefined ? { opacity } : {}),
      ...(userStyleTransform
        ? { userStyleTransform, userStyleTransformKey }
        : {}),
    };
    return { type: "vector", ...vectorLayer };
  }, [styleUrl, style, layerId, opacity, configs, selections]);

  return { libreLayer, selectors, configs, selections, setSelection };
};
