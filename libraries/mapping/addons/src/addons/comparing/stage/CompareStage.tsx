import { useCallback, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Map as MaplibreMap } from "maplibre-gl";

import { ComparePanel } from "./ComparePanel";
import { useCameraSync } from "./useCameraSync";
import { layersForPanel, type Roles } from "./roles";
import "./comparing.css";

type CompareStageProps = {
  /** the app's own map, hidden while this is mounted and driving the panels */
  appMap: MaplibreMap;
  roles: Roles;
  /** one clip-path per panel, `"none"` for an unclipped panel */
  clipPaths: string[];
  /** drawn over the panels, e.g. a splitter */
  children?: ReactNode;
  overrideGlyphs?: string;
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
  clipPaths,
  children,
  overrideGlyphs,
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
    register("app", appMap);
    return () => {
      register("app", null);
    };
  }, [appMap, register]);

  const handlePanelReady = useCallback(
    (index: number, map: MaplibreMap) => {
      register(`panel-${index}`, map);
      // a fresh panel starts at LibreMap's own default view, so pull it onto
      // the camera the app is already showing
      syncFrom(appMap);
    },
    [appMap, register, syncFrom]
  );

  const container = appMap.getContainer();
  const host = container.parentElement ?? container;

  return createPortal(
    <div
      className="carma-comparing"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
      }}
    >
      {roles.panels.map((_, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            clipPath: clipPaths[index],
            WebkitClipPath: clipPaths[index],
          }}
        >
          <ComparePanel
            layers={layersForPanel(roles, index)}
            onMapReady={(map) => handlePanelReady(index, map)}
            overrideGlyphs={overrideGlyphs}
          />
        </div>
      ))}
      {children}
    </div>,
    host
  );
};
