import { Button, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLayerGroup,
  faPause,
  faPlay,
} from "@fortawesome/free-solid-svg-icons";
import type { ResolvedDebugOptions } from "./tile-loading-debug-options";
import type { createTileLoadingDebugPanels } from "./tile-loading-debug-panels";
import { TILE_LOADING_DEBUG_PANEL_ID } from "./tile-loading-debug-tokens";

type Panel = ReturnType<typeof createTileLoadingDebugPanels>[number];

export const TileLoadingDebugToolbar = ({
  options,
  onOptionsChange,
  toolsVisible,
  paused,
  onPausedChange,
  panels,
}: {
  options: ResolvedDebugOptions;
  onOptionsChange: (patch: Partial<ResolvedDebugOptions>) => void;
  toolsVisible: boolean;
  paused: boolean | null;
  onPausedChange: (paused: boolean) => void;
  panels: readonly Panel[];
}) => (
  <>
    {
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          width: "max-content",
        }}
      >
        <fieldset
          disabled={!options.telemetryEnabled}
          style={{
            display: options.telemetryEnabled ? "contents" : "none",
          }}
        >
          <span
            role="group"
            aria-label="Panels"
            style={{ display: "flex", gap: 2 }}
          >
            <Button
              type={options.showOverviewOptions ? "primary" : "text"}
              aria-label="Overview options"
              title="Tile overview · options and legend"
              aria-pressed={!!options.showOverviewOptions && toolsVisible}
              icon={<FontAwesomeIcon icon={faLayerGroup} />}
              onClick={() =>
                onOptionsChange({
                  showOverviewOptions:
                    !toolsVisible || !options.showOverviewOptions,
                  hideAllDebugPanels: false,
                })
              }
            />
            {panels
              .filter(
                (panel) =>
                  panel.id !== TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW_OPTIONS
              )
              .map((panel) => (
                <Tooltip key={panel.id} title={panel.label}>
                  <Button
                    type={options[panel.flag] ? "primary" : "text"}
                    icon={<FontAwesomeIcon icon={panel.icon} />}
                    aria-label={panel.label}
                    aria-pressed={
                      options[panel.flag] && !options.hideAllDebugPanels
                    }
                    onClick={() =>
                      onOptionsChange({
                        [panel.flag]: !toolsVisible || !options[panel.flag],
                        telemetryEnabled: true,
                        hideAllDebugPanels: false,
                      })
                    }
                  />
                </Tooltip>
              ))}
          </span>
        </fieldset>
        <span role="separator" aria-orientation="vertical" />
        <Button
          type={paused ? "primary" : "text"}
          icon={<FontAwesomeIcon icon={paused ? faPlay : faPause} />}
          aria-label={paused ? "Resume scene" : "Pause scene"}
          aria-pressed={!!paused}
          title="Pause / resume shared scene rendering and tile loading"
          onClick={() => onPausedChange(!paused)}
        />
      </div>
    }
  </>
);
