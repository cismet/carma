import type {
  DynamicStylingConfig,
  DynamicStylingListConfig,
  DynamicStylingVisibilityConfig,
} from "@carma/types";
import { Dropdown } from "antd";
import {
  faToggleOff,
  faToggleOn,
  faPalette,
  faChevronDown,
  faChevronUp,
} from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const ICON_PREFIX =
  "https://geo.wuppertal.de/geoportal/geoportal_icon_legends/";

const resolveIconSrc = (icon: string | undefined): string | undefined => {
  if (!icon) return undefined;
  if (icon.startsWith("http://") || icon.startsWith("https://")) return icon;
  return `${ICON_PREFIX}${icon}.png`;
};

const parseTarget = (target: string) => {
  const parts = target.split(".");
  return {
    category: parts[0],
    rest: parts.slice(1),
  };
};

const setNestedValue = (obj: any, path: string[], value: unknown) => {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (current[path[i]] == null || typeof current[path[i]] !== "object") {
      current[path[i]] = {};
    }
    current = current[path[i]];
  }
  current[path[path.length - 1]] = value;
};

const defaultLayerValues: Record<string, Record<string, unknown>> = {};

const captureDefaults = (
  stylesheet: any,
  carmaLayerId: string,
  config: DynamicStylingListConfig
) => {
  if (defaultLayerValues[carmaLayerId]) return defaultLayerValues[carmaLayerId];

  const defaults: Record<string, unknown> = {};
  for (const [, targets] of Object.entries(config.targets)) {
    for (const target of targets) {
      const { category, rest } = parseTarget(target);
      if (category !== "layers") continue;
      const [layerId, type, ...propertyParts] = rest;
      const layer = stylesheet.layers?.find((l: any) => l.id === layerId);
      if (!layer) continue;
      const property = propertyParts.join(".");
      const val = layer[type]?.[property];
      if (val !== undefined && val !== null) {
        defaults[target] = JSON.parse(JSON.stringify(val));
      }
    }
  }
  defaultLayerValues[carmaLayerId] = defaults;
  return defaults;
};

export type MetadataChanges = Record<string, unknown>;

export const applyDynamicStyling = (
  libreMap: any,
  carmaLayerId: string,
  config: DynamicStylingListConfig,
  selectedOptionId: string
): MetadataChanges => {
  const stylesheet = libreMap.style?.stylesheet;
  if (!stylesheet) return {};

  const defaultOption = config.options.find((o) => o.id === config.default);
  const selectedOption = config.options.find((o) => o.id === selectedOptionId);
  if (!defaultOption || !selectedOption) return {};

  const defaults = captureDefaults(stylesheet, carmaLayerId, config);
  const updatedStylesheet = JSON.parse(JSON.stringify(stylesheet));
  const metadataChanges: MetadataChanges = {};

  for (const [key, targets] of Object.entries(config.targets)) {
    const value = selectedOption[key];
    if (value === undefined) continue;

    for (const target of targets) {
      const { category, rest } = parseTarget(target);

      if (category === "layers") {
        const [layerId, type, ...propertyParts] = rest;
        const layer = updatedStylesheet.layers?.find(
          (l: any) => l.id === layerId
        );
        if (!layer) continue;
        const property = propertyParts.join(".");
        if (!layer[type]) layer[type] = {};

        const originalVal = defaults[target];
        if (originalVal === undefined) {
          layer[type][property] = value;
          continue;
        }

        const fromVal = defaultOption[key];
        const replacements: [string, string][] = [
          [String(fromVal), String(value)],
        ];
        if (selectedOption.replacements?.[key]) {
          replacements.push(
            ...(selectedOption.replacements[key] as [string, string][])
          );
        }

        let serialized = JSON.stringify(originalVal);
        for (const [from, to] of replacements) {
          serialized = serialized.replaceAll(from, to);
        }
        layer[type][property] = JSON.parse(serialized);
      } else {
        setNestedValue(updatedStylesheet, [category, ...rest], value);
        metadataChanges[rest.join(".")] = value;
      }
    }
  }

  libreMap.setStyle(updatedStylesheet);
  return metadataChanges;
};

export const applyDynamicVisibility = (
  libreMap: any,
  config: DynamicStylingVisibilityConfig,
  selection: "visible" | "hidden"
) => {
  const visibility = selection === "visible" ? "visible" : "none";
  for (const layerId of config.layers) {
    try {
      if (libreMap.getLayer(layerId)) {
        libreMap.setLayoutProperty(layerId, "visibility", visibility);
      }
    } catch (error) {
      console.error(
        `[DynamicVisibility] Error setting visibility on ${layerId}:`,
        error
      );
    }
  }
};

export interface DynamicStylingControlProps {
  config: DynamicStylingConfig;
  maplibreMap: any;
  carmaLayerId: string;
  currentSelection: string;
  onSelectionChange: (selection: string) => void;
  onMetadataChange?: (changes: MetadataChanges) => void;
  showIcon?: boolean;
  children?: React.ReactNode;
}

const DynamicStylingList = ({
  config,
  maplibreMap,
  carmaLayerId,
  currentSelection,
  onSelectionChange,
  onMetadataChange,
  showIcon: showIconProp,
  children,
}: DynamicStylingControlProps) => {
  const listConfig = config as DynamicStylingListConfig;
  const currentOption = listConfig.options.find(
    (o) => o.id === currentSelection
  );
  const isBinaryToggle = listConfig.options.length === 2;
  const showIcon = showIconProp ?? config.showIcon !== false;

  const handleOptionSelect = (key: string) => {
    if (key === currentSelection) return;
    const opt = listConfig.options.find((o) => o.id === key);
    if (!opt) return;
    if (maplibreMap) {
      const changes = applyDynamicStyling(
        maplibreMap,
        carmaLayerId,
        listConfig,
        opt.id
      );
      if (onMetadataChange && Object.keys(changes).length > 0) {
        onMetadataChange(changes);
      }
    }
    onSelectionChange(key);
  };

  const dropdownItems = listConfig.options.map((opt) => ({
    key: opt.id,
    label: (
      <div className="flex items-center gap-2">
        {resolveIconSrc(opt.icon) ? (
          <img
            src={resolveIconSrc(opt.icon)}
            alt={opt.title}
            className="w-4 h-4 object-contain"
          />
        ) : (
          <span
            className="inline-block w-3 h-3 rounded-full border border-gray-300"
            style={{ backgroundColor: opt.color }}
          />
        )}
        {opt.title}
      </div>
    ),
  }));

  const [dropdownOpen, setDropdownOpen] = useState(false);

  const dropdownProps: Pick<
    React.ComponentProps<typeof Dropdown>,
    "trigger" | "align" | "menu"
  > = {
    trigger: ["click"],
    align: { offset: [-16, 10] },
    menu: {
      selectedKeys: [currentSelection],
      onClick: ({ key, domEvent }) => {
        domEvent.stopPropagation();
        handleOptionSelect(key);
      },
      items: dropdownItems,
    },
  };

  if (children) {
    return (
      <Dropdown
        {...dropdownProps}
        open={dropdownOpen}
        onOpenChange={setDropdownOpen}
      >
        <div
          className="flex items-center cursor-pointer"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {children}
          <FontAwesomeIcon
            icon={dropdownOpen ? faChevronUp : faChevronDown}
            style={{ fontSize: "6px", marginLeft: "2px" }}
            className="text-gray-500"
          />
        </div>
      </Dropdown>
    );
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextOption = listConfig.options.find(
      (o) => o.id !== currentSelection
    );
    if (!nextOption) return;
    if (maplibreMap) {
      const changes = applyDynamicStyling(
        maplibreMap,
        carmaLayerId,
        listConfig,
        nextOption.id
      );
      if (onMetadataChange && Object.keys(changes).length > 0) {
        onMetadataChange(changes);
      }
    }
    onSelectionChange(nextOption.id);
  };

  if (isBinaryToggle) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          id={`stylingLayerButton-${carmaLayerId}`}
          className="px-1.5 flex items-center gap-1 justify-center"
          onClick={handleToggle}
        >
          {showIcon && (
            <FontAwesomeIcon
              icon={faPalette}
              className="text-sm text-gray-600 hover:text-gray-500"
            />
          )}
          {resolveIconSrc(currentOption?.icon) ? (
            <img
              src={resolveIconSrc(currentOption?.icon)}
              alt={currentOption?.title}
              className="w-4 h-4 object-contain"
            />
          ) : (
            <span
              className="inline-block w-2.5 h-2.5 rounded-full border border-gray-300"
              style={{ backgroundColor: currentOption?.color }}
            />
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Dropdown {...dropdownProps}>
        <button
          id={`stylingLayerButton-${carmaLayerId}`}
          className="px-1.5 flex items-center gap-1 justify-center"
        >
          {showIcon && (
            <FontAwesomeIcon
              icon={faPalette}
              className="text-sm text-gray-600 hover:text-gray-500"
            />
          )}
          {resolveIconSrc(currentOption?.icon) ? (
            <img
              src={resolveIconSrc(currentOption?.icon)}
              alt={currentOption?.title}
              className="w-4 h-4 object-contain"
            />
          ) : (
            <span
              className="inline-block w-2.5 h-2.5 rounded-full border border-gray-300"
              style={{ backgroundColor: currentOption?.color }}
            />
          )}
        </button>
      </Dropdown>
    </div>
  );
};

const DynamicStylingVisibility = ({
  config,
  maplibreMap,
  carmaLayerId,
  currentSelection,
  onSelectionChange,
}: DynamicStylingControlProps) => {
  const visConfig = config as DynamicStylingVisibilityConfig;
  const isVisible = currentSelection === "visible";
  const customSvg = isVisible ? visConfig.iconVisible : visConfig.iconHidden;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = isVisible ? "hidden" : "visible";
    if (maplibreMap) {
      applyDynamicVisibility(maplibreMap, visConfig, next);
    }
    onSelectionChange(next);
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        id={`visibilityLayerButton-${carmaLayerId}`}
        className="px-1.5 flex items-center justify-center"
        onClick={handleToggle}
      >
        {customSvg ? (
          <span
            className="inline-flex items-center justify-center w-[14px] h-[14px] text-gray-600 hover:text-gray-500"
            dangerouslySetInnerHTML={{ __html: customSvg }}
          />
        ) : (
          <FontAwesomeIcon
            icon={isVisible ? faToggleOn : faToggleOff}
            className="text-sm text-gray-600 hover:text-gray-500"
          />
        )}
      </button>
    </div>
  );
};

export const DynamicStylingControl = (props: DynamicStylingControlProps) => {
  switch (props.config.type) {
    case "list":
      return <DynamicStylingList {...props} />;
    case "visibility":
      return <DynamicStylingVisibility {...props} />;
    default:
      return null;
  }
};
