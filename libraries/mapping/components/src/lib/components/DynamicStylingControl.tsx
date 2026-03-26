import type { DynamicStylingConfig } from "@carma/types";
import { Dropdown } from "antd";
import { faPalette } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const dynamicStylingOriginals: Record<string, Record<string, unknown>> = {};

const parseTarget = (target: string) => {
  const firstDot = target.indexOf(".");
  const secondDot = target.indexOf(".", firstDot + 1);
  return {
    layerId: target.substring(0, firstDot),
    type: target.substring(firstDot + 1, secondDot) as "paint" | "layout",
    property: target.substring(secondDot + 1),
  };
};

const getProperty = (libreMap: any, target: string) => {
  const { layerId, type, property } = parseTarget(target);
  if (!libreMap.getLayer(layerId)) return undefined;
  return type === "paint"
    ? libreMap.getPaintProperty(layerId, property)
    : libreMap.getLayoutProperty(layerId, property);
};

const setProperty = (libreMap: any, target: string, value: unknown) => {
  const { layerId, type, property } = parseTarget(target);
  if (type === "paint") {
    libreMap.setPaintProperty(layerId, property, value);
  } else {
    libreMap.setLayoutProperty(layerId, property, value);
  }
};

const captureOriginals = (
  libreMap: any,
  carmaLayerId: string,
  config: DynamicStylingConfig
) => {
  if (dynamicStylingOriginals[carmaLayerId]) {
    return dynamicStylingOriginals[carmaLayerId];
  }
  const originals: Record<string, unknown> = {};
  for (const target of config.targets) {
    const val = getProperty(libreMap, target);
    if (val !== undefined && val !== null) {
      originals[target] = JSON.parse(JSON.stringify(val));
    }
  }
  dynamicStylingOriginals[carmaLayerId] = originals;
  return originals;
};

export const applyDynamicStyling = (
  libreMap: any,
  carmaLayerId: string,
  config: DynamicStylingConfig,
  selectedOptionId: string
) => {
  const originals = captureOriginals(libreMap, carmaLayerId, config);
  const defaultOption = config.options.find((o) => o.id === config.default);
  const selectedOption = config.options.find((o) => o.id === selectedOptionId);
  if (!defaultOption || !selectedOption) return;

  if (selectedOptionId === config.default) {
    for (const target of config.targets) {
      const originalVal = originals[target];
      if (originalVal === undefined) continue;
      try {
        setProperty(libreMap, target, JSON.parse(JSON.stringify(originalVal)));
      } catch (error) {
        console.error(`[DynamicStyling] Error restoring ${target}:`, error);
      }
    }
    return;
  }

  let replacements: [string, string][];
  if (selectedOption.colorMap) {
    replacements = selectedOption.colorMap;
  } else {
    const fromColor = defaultOption.color;
    const toColor = selectedOption.color;
    replacements = [
      [fromColor, toColor],
      [fromColor.toLowerCase(), toColor.toLowerCase()],
      [
        fromColor.replace("#", "").toLowerCase(),
        toColor.replace("#", "").toLowerCase(),
      ],
    ];
  }

  for (const target of config.targets) {
    const originalVal = originals[target];
    if (originalVal === undefined) continue;
    try {
      let serialized = JSON.stringify(originalVal);
      for (const [from, to] of replacements) {
        serialized = serialized.replaceAll(from, to);
      }
      setProperty(libreMap, target, JSON.parse(serialized));
    } catch (error) {
      console.error(`[DynamicStyling] Error applying ${target}:`, error);
    }
  }
};

export interface DynamicStylingControlProps {
  config: DynamicStylingConfig;
  maplibreMap: any;
  carmaLayerId: string;
  currentSelection: string;
  onSelectionChange: (selection: string) => void;
}

const DynamicStylingList = ({
  config,
  maplibreMap,
  carmaLayerId,
  currentSelection,
  onSelectionChange,
}: DynamicStylingControlProps) => {
  const currentOption = config.options.find((o) => o.id === currentSelection);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Dropdown
        trigger={["click"]}
        menu={{
          selectedKeys: [currentSelection],
          onClick: ({ key }) => {
            if (key === currentSelection) return;
            const opt = config.options.find((o) => o.id === key);
            if (!opt) return;
            if (maplibreMap) {
              applyDynamicStyling(maplibreMap, carmaLayerId, config, opt.id);
            }
            onSelectionChange(key);
          },
          items: config.options.map((opt) => ({
            key: opt.id,
            label: (
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full border border-gray-300"
                  style={{ backgroundColor: opt.color }}
                />
                {opt.name}
              </div>
            ),
          })),
        }}
      >
        <button
          id={`stylingLayerButton-${carmaLayerId}`}
          className="px-1.5 flex items-center gap-1 justify-center"
        >
          <FontAwesomeIcon
            icon={faPalette}
            className="text-sm text-gray-600 hover:text-gray-500"
          />
          <span
            className="inline-block w-2.5 h-2.5 rounded-full border border-gray-300"
            style={{
              backgroundColor: currentOption?.color,
            }}
          />
        </button>
      </Dropdown>
    </div>
  );
};

export const DynamicStylingControl = (props: DynamicStylingControlProps) => {
  switch (props.config.type) {
    case "list":
      return <DynamicStylingList {...props} />;
    default:
      return null;
  }
};
