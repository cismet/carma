import { useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { faMap } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { DynamicStylingOptionsConfig } from "@carma-mapping/layers";
import { DynamicStylingControl } from "@carma-mapping/components";
import { resolveIconUrl } from "@carma-mapping/utils";

export interface UseDynamicStylingProps {
  layerId: string;
  styleUrl?: string;
  style?: any;
  configs?: DynamicStylingOptionsConfig[];
  selectorIcon?: (
    config: DynamicStylingOptionsConfig,
    selection: string,
    configIndex: number
  ) => ReactNode;
}

export interface UseDynamicStylingResult {
  configs: DynamicStylingOptionsConfig[];
  selections: Record<number, string>;
  setSelection: (configIndex: number, selection: string) => void;
  selectors: ReactNode[];
}

const toConfigArray = (
  dynamicStyling:
    | DynamicStylingOptionsConfig
    | DynamicStylingOptionsConfig[]
    | undefined
): DynamicStylingOptionsConfig[] => {
  if (Array.isArray(dynamicStyling)) {
    return dynamicStyling;
  }
  return dynamicStyling ? [dynamicStyling] : [];
};

const buildDefaultSelections = (
  configs: DynamicStylingOptionsConfig[]
): Record<number, string> =>
  Object.fromEntries(
    configs.map((config, configIndex) => [configIndex, config.default])
  );

const defaultSelectorIcon = (
  config: DynamicStylingOptionsConfig,
  selection: string
): ReactNode => {
  const currentOption = config.options.find((option) => option.id === selection);
  const iconSrc = resolveIconUrl(currentOption?.icon);
  return iconSrc ? (
    <img
      src={iconSrc}
      alt={currentOption?.title}
      className="w-4 h-4 object-contain"
    />
  ) : (
    <FontAwesomeIcon icon={faMap} className="text-base text-black" />
  );
};

export const useDynamicStyling = ({
  layerId,
  styleUrl,
  style,
  configs: providedConfigs,
  selectorIcon,
}: UseDynamicStylingProps): UseDynamicStylingResult => {
  const [configs, setConfigs] = useState<DynamicStylingOptionsConfig[]>(
    providedConfigs ?? []
  );
  const [selections, setSelections] = useState<Record<number, string>>(() =>
    buildDefaultSelections(providedConfigs ?? [])
  );

  useEffect(() => {
    if (providedConfigs) {
      setConfigs(providedConfigs);
      setSelections(buildDefaultSelections(providedConfigs));
      return;
    }
    if (style) {
      const parsedConfigs = toConfigArray(
        style?.metadata?.carmaConf?.dynamicStyling
      );
      setConfigs(parsedConfigs);
      setSelections(buildDefaultSelections(parsedConfigs));
      return;
    }
    if (!styleUrl) {
      return;
    }
    let cancelled = false;
    fetch(styleUrl)
      .then((response) => response.json())
      .then((fetchedStyle) => {
        if (cancelled) {
          return;
        }
        const parsedConfigs = toConfigArray(
          fetchedStyle?.metadata?.carmaConf?.dynamicStyling
        );
        if (!parsedConfigs.length) {
          console.warn(
            "[useDynamicStyling] No dynamicStyling configs found in",
            styleUrl
          );
        }
        setConfigs(parsedConfigs);
        setSelections(buildDefaultSelections(parsedConfigs));
      })
      .catch((error) => {
        console.error("[useDynamicStyling] Failed to fetch style", error);
      });
    return () => {
      cancelled = true;
    };
  }, [styleUrl, style, providedConfigs]);

  const setSelection = useCallback(
    (configIndex: number, selection: string) => {
      setSelections((previousSelections) => {
        if (previousSelections[configIndex] === selection) {
          return previousSelections;
        }
        return { ...previousSelections, [configIndex]: selection };
      });
    },
    []
  );

  const selectors = useMemo<ReactNode[]>(() => {
    return configs.map((config, configIndex) => {
      const selection = selections[configIndex] ?? config.default;
      const iconNode = selectorIcon
        ? selectorIcon(config, selection, configIndex)
        : defaultSelectorIcon(config, selection);
      return (
        <DynamicStylingControl
          key={`${layerId}-dyn-${configIndex}`}
          config={config}
          maplibreMap={null}
          carmaLayerId={`${layerId}-${configIndex}`}
          currentSelection={selection}
          onSelectionChange={(nextSelection) =>
            setSelection(configIndex, nextSelection)
          }
        >
          {iconNode}
        </DynamicStylingControl>
      );
    });
  }, [configs, selections, layerId, selectorIcon, setSelection]);

  return { configs, selections, setSelection, selectors };
};
