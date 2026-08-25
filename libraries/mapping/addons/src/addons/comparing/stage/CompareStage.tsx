import {
  useCallback,
  useEffect,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Map as MaplibreMap } from "maplibre-gl";

import type { ThreeRuntimeParams } from "@carma-mapping/engines/maplibre";

import { ComparePanel } from "./ComparePanel";
import { stageHostOf } from "./stage-host";
import { useCameraSync } from "./useCameraSync";
import { layersForPanel, type Roles } from "./roles";
import "./comparing.css";

type CompareStageProps = {
  /** the app's own map, hidden while this is mounted and driving the panels */
  appMap: MaplibreMap;
  roles: Roles;
  /**
   * One wrapper style per panel: where that panel sits over the map.
   *
   * A mode places its panels rather than being placed: swipe stacks them
   * full-size and clips each to its stripe, arena gives each one a real box in
   * a grid. Both are the same set of panels on the same camera, so only the
   * wrapper differs and the stage stays out of it.
   */
  panelStyles: CSSProperties[];
  /** the box the panels are placed in, for a mode that needs a real layout */
  containerStyle?: CSSProperties;
  /** drawn over all the panels, e.g. a splitter */
  children?: ReactNode;
  overrideGlyphs?: string;
  /**
   * When the hidden app map follows the panels: on every frame like a panel, or
   * only once the movement comes to rest.
   *
   * Nobody sees that map while comparing, but it renders a full pass per frame
   * either way, on the same thread as the panels that are being watched.
   * Holding it back buys that pass back and costs only that the url hash and
   * `carma.mapping2D` lag behind a drag until it ends, which is when the hash
   * is written anyway. `live` is here for a route where something reads the app
   * map's camera continuously.
   */
  appMapSync?: "live" | "settled";
  /**
   * The app map's three.js switch, handed to every panel so a 3D layer is 3D
   * in the comparison as well. Read off the app map by the mode rather than
   * configured on the route: the panels show that map's content, so they draw
   * it the way that map does.
   */
  threeRuntimeParams?: ThreeRuntimeParams;
};

/**
 * Stacks the compare panels over the app's map and keeps every map on one
 * camera.
 *
 * The app's map stays mounted and merely becomes invisible. That is what keeps
 * the rest of the app working: the zoom buttons, the home button, the gazetteer
 * and `carma.mapping2D` all still move that map, and moving it syncs the
 * panels, so none of them need to know comparing is on. It also keeps writing
 * the url hash, and leaving the mode reveals a map already at the compared
 * view.
 *
 * The app map follows the panels like any other registered map, but by default
 * only once a movement settles: it is invisible, yet it would otherwise cost a
 * render pass per frame competing with the panels on screen. The camera it owes
 * is handed over on `moveend` and again when this component goes away, so the
 * map revealed on the way out sits where the comparison left it.
 *
 * `visibility` rather than `display`: `display: none` collapses the canvas to
 * zero size, which makes MapLibre lose its dimensions and forces a resize dance
 * on the way out.
 *
 * The panels are rendered through a portal into the app map's own wrapper
 * rather than where this component sits in the tree. `ControlLayoutCanvas` is
 * sealed with `isolation: isolate`, so everything inside it (the map at stack
 * level 0, the controls at 1000) ranks only against its siblings, and anything
 * rendered outside it ranks against the sealed canvas as a whole. An addon
 * painting from `AddonHost`, which is outside, therefore either sits under the
 * entire map or covers the entire control column, with no value in between.
 * Going in through the map's wrapper puts the panels where the map itself is,
 * and the controls keep their 1000 without anyone having to guess a number.
 */
export const CompareStage = ({
  appMap,
  roles,
  panelStyles,
  containerStyle,
  children,
  overrideGlyphs,
  appMapSync = "settled",
  threeRuntimeParams,
}: CompareStageProps) => {
  const { register, syncFrom } = useCameraSync();

  useEffect(() => {
    const container = appMap.getContainer();
    const previous = container.style.visibility;
    container.style.visibility = "hidden";
    return () => {
      container.style.visibility = previous;
    };
  }, [appMap]);

  useEffect(() => {
    register("app", appMap, { deferred: appMapSync === "settled" });
    return () => {
      register("app", null);
    };
  }, [appMap, appMapSync, register]);

  const handlePanelReady = useCallback(
    (index: number, map: MaplibreMap) => {
      register(`panel-${index}`, map);
      // a fresh panel starts at LibreMap's own default view, so pull it onto
      // the camera the app is already showing
      syncFrom(appMap);
    },
    [appMap, register, syncFrom]
  );

  return createPortal(
    <div
      className="carma-comparing"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        ...containerStyle,
      }}
    >
      {roles.panels.map((_, index) => (
        <div key={index} style={{ overflow: "hidden", ...panelStyles[index] }}>
          <ComparePanel
            layers={layersForPanel(roles, index)}
            onMapReady={(map) => handlePanelReady(index, map)}
            overrideGlyphs={overrideGlyphs}
            threeRuntimeParams={threeRuntimeParams}
          />
        </div>
      ))}
      {children}
    </div>,
    stageHostOf(appMap)
  );
};
