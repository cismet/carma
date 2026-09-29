import { Button, ColorPicker, Slider } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDrawPolygon } from "@fortawesome/free-solid-svg-icons";
import { TILE_DIAGNOSTIC_EXTENTS_MODE } from "@carma-mapping/engines/maplibre";
import {
  DiagnosticChoice,
  DiagnosticSection,
  DIAGNOSTIC_BOOLEAN_CHOICES,
} from "./DiagnosticControls";
import {
  DEBUG_COLOR_MODES,
  type ResolvedDebugOptions,
  type TileLoadingDebugOptions,
} from "./tile-loading-debug-options";

export const TileLoadingDebugMeshStyle = ({
  options,
  onOptionsChange,
}: {
  options: ResolvedDebugOptions;
  onOptionsChange: (patch: Partial<ResolvedDebugOptions>) => void;
}) => (
  <div className="tile-debug-form">
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      Mesh fill
      <Slider
        style={{ flex: 1 }}
        min={0}
        max={1}
        step={0.05}
        value={options.meshFillOpacity ?? 1}
        onChange={(meshFillOpacity) => onOptionsChange({ meshFillOpacity })}
      />
    </label>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span>Wireframe color</span>
      <ColorPicker
        disabledAlpha
        value={options.wireframeColor ?? "#ffe985"}
        onChange={(color) =>
          onOptionsChange({ wireframeColor: color.toHexString() })
        }
      >
        <Button
          aria-label="Wireframe color"
          title="Wireframe color"
          style={{
            color: options.wireframeColor ?? "#ffe985",
            background: "#243444",
          }}
          icon={<FontAwesomeIcon icon={faDrawPolygon} />}
        />
      </ColorPicker>
    </div>
    {(
      [
        ["showTileGeometry", "Wireframe"],
        ["sceneLabels", "Tile labels"],
        ["debugBoxBounds", "Native tile bounding volumes"],
      ] as const
    ).map(([flag, label]) => (
      <DiagnosticChoice
        key={flag}
        label={label}
        value={options[flag]}
        choices={DIAGNOSTIC_BOOLEAN_CHOICES}
        onChange={(value) => onOptionsChange({ [flag]: value })}
      />
    ))}
    <DiagnosticSection
      title="Colors and bounding volumes"
      initiallyOpen={false}
    >
      <DiagnosticChoice
        label="Tile coloring"
        value={options.debugColorMode}
        onChange={(debugColorMode: TileLoadingDebugOptions["debugColorMode"]) =>
          onOptionsChange({ debugColorMode })
        }
        choices={DEBUG_COLOR_MODES.map((value) => ({
          value,
          label: value.toLowerCase().replaceAll("_", " "),
        }))}
      />
      <DiagnosticChoice
        label="Retained geometry extents"
        value={options.sceneExtents}
        onChange={(sceneExtents: TileLoadingDebugOptions["sceneExtents"]) =>
          onOptionsChange({ sceneExtents })
        }
        choices={Object.values(TILE_DIAGNOSTIC_EXTENTS_MODE).map((value) => ({
          value,
          label: value,
        }))}
      />
      {(
        [
          ["debugSphereBounds", "Native bounding spheres"],
          ["debugParentBounds", "Parent bounds"],
          ["debugUnlit", "Unlit materials"],
        ] as const
      ).map(([flag, label]) => (
        <DiagnosticChoice
          key={flag}
          label={label}
          value={options[flag]}
          choices={DIAGNOSTIC_BOOLEAN_CHOICES}
          onChange={(value) => onOptionsChange({ [flag]: value })}
        />
      ))}
    </DiagnosticSection>
  </div>
);
