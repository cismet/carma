import { useEffect, useState, type CSSProperties } from "react";
import { AttributionControl } from "maplibre-gl";

import { Control, type Positions } from "@carma-mapping/map-controls-layout";

import type { AddonComponentProps } from "../../lib/registry";
import { TransientAttributionControl } from "./TransientAttributionControl";

export type AttributionConfig = {
  /**
   * "persistent": always shown. "transient": shown for `hideAfterSeconds`,
   * then removed, and shown again whenever the credits change; map
   * interaction does not affect it. Default "persistent".
   */
  mode?: "persistent" | "transient";
  /** transient only: seconds before it is removed. Default 5. */
  hideAfterSeconds?: number;
  /** fixed credit (HTML), shown next to the attributions of the visible sources */
  html?: string;
  controlPosition?: Positions;
  controlOrder?: number;
};

const DEFAULT_HIDE_AFTER_SECONDS = 5;
const DEFAULT_CONTROL_POSITION: Positions = "bottomright";
// below the infobox (11) and everything else in the bottom-right column
const DEFAULT_CONTROL_ORDER = 100;

// what `.maplibregl-map` gives the control when it sits in MapLibre's corner
const HOST_STYLE: CSSProperties = {
  pointerEvents: "auto",
  font: "12px/20px 'Helvetica Neue', Arial, Helvetica, sans-serif",
};

/**
 * Credits on the libre map. The engine creates its maps without MapLibre's
 * attribution control; this puts it back. The credits come from the
 * `attribution` of every source a visible layer uses, so a style declares its
 * own (e.g. the OSM Shortbread background), plus the optional `html`. With
 * nothing to credit nothing shows.
 *
 * The control is not added to the map: MapLibre's corners sit under the carma
 * control layout, where the infobox would cover it. Its element is mounted in
 * a control column instead, so it stacks with the infobox.
 */
export const Attribution = ({
  config = {},
  libreMap,
}: AddonComponentProps<"attribution">) => {
  const {
    mode = "persistent",
    hideAfterSeconds = DEFAULT_HIDE_AFTER_SECONDS,
    html,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
  } = config;
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!libreMap || !host) {
      return;
    }
    const control =
      mode === "transient"
        ? new TransientAttributionControl({
            hideAfterMs: hideAfterSeconds * 1000,
            customAttribution: html,
          })
        : new AttributionControl({ compact: false, customAttribution: html });
    host.appendChild(control.onAdd(libreMap));
    return () => {
      control.onRemove();
    };
  }, [libreMap, host, mode, hideAfterSeconds, html]);

  return (
    <Control position={controlPosition} order={controlOrder}>
      <div ref={setHost} style={HOST_STYLE} data-testid="attribution-control" />
    </Control>
  );
};
