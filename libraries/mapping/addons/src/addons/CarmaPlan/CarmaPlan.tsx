import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPersonDigging } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";

import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";
import { setTiles3dCutout } from "@carma-mapping/engines/maplibre";

import type { AddonComponentProps } from "../../lib/registry";
import { buildCarmaPlanScenario } from "./build-scenario";
import { useCarmaPlanActions } from "./carma-plan-actions";
import { CARMA_PLAN_ICON_COLOR } from "./carma-plan-layer-row";
import { loadGroundSampler, type GroundSampler } from "./ground";
import { mountScenario } from "./scenario-runtime";
import { boxOfPolygons } from "./site-frame";
import { loadCarmaPlanSite, type CarmaPlanSite } from "./site";

export type CarmaPlanConfig = {
  /**
   * GeoJSON of the site: a Polygon, a MultiPolygon or a closed LineString
   * (a site drawn with the measurement tool), as a Feature or a collection.
   */
  siteUrl: string;
  controlPosition?: Positions;
  controlOrder?: number;
};

const CUTOUT_ID = "carma-plan";
const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 95;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * carma plan: swap reality for a planned scenario on a site. The site is cut
 * out of every 3D tileset on the map (the mesh among them) and the scenario,
 * always low poly, takes its place: a construction site, a parking lot or a
 * playground.
 *
 * Everything runs through the `carmaPlan` channel. The control column button
 * switches the plan on and off; while it is on the layer bar shows a row whose
 * panel picks the scenario, "Bestand" among them, which keeps the plan on and
 * the mesh as it is. The row announces the plan, so the button's blue means
 * "panel open" (ADDON-UI.md).
 */
export const CarmaPlan = ({
  config,
  libreMap,
}: AddonComponentProps<"carmaPlan">) => {
  const siteUrl = config?.siteUrl;
  const controlPosition = config?.controlPosition ?? DEFAULT_CONTROL_POSITION;
  const controlOrder = config?.controlOrder ?? DEFAULT_CONTROL_ORDER;
  const { isOn, toggle, scenario, panelOpen, update } = useCarmaPlanActions();
  const [site, setSite] = useState<CarmaPlanSite | null>(null);
  // the DGM under the site is loaded once and kept across switching
  const groundRef = useRef<{
    site: CarmaPlanSite;
    ground: Promise<GroundSampler>;
  } | null>(null);

  useEffect(() => {
    if (!siteUrl) return;
    const abort = new AbortController();
    loadCarmaPlanSite(siteUrl, abort.signal)
      .then((loaded) => {
        setSite(loaded);
        update({ siteTitle: loaded.title, error: null });
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        console.error("[CARMA PLAN]", error);
        update({ error: `Fläche nicht geladen: ${messageOf(error)}` });
      });
    return () => abort.abort();
  }, [siteUrl, update]);

  const planned = isOn && scenario !== "reality";

  // the hole stays while any scenario is shown, so switching between them
  // never lets the mesh flash through
  useEffect(() => {
    if (!libreMap || !site || !planned) return;
    return setTiles3dCutout(libreMap, CUTOUT_ID, site.polygons);
  }, [libreMap, site, planned]);

  useEffect(() => {
    if (!libreMap || !site || !isOn || scenario === "reality") return;
    let cancelled = false;
    let unmount: (() => void) | null = null;
    if (groundRef.current?.site !== site)
      groundRef.current = {
        site,
        ground: loadGroundSampler(boxOfPolygons(site.polygons)),
      };
    update({ isLoading: true, error: null });
    groundRef.current.ground
      .then((ground) => {
        if (cancelled) return;
        const built = buildCarmaPlanScenario(scenario, site.polygons, ground);
        console.info("[CARMA PLAN]", scenario, site.title, built.stats);
        unmount = mountScenario(libreMap, built);
        update({ isLoading: false });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[CARMA PLAN]", error);
        update({
          isLoading: false,
          error: `Szenario nicht gebaut: ${messageOf(error)}`,
        });
      });
    return () => {
      cancelled = true;
      unmount?.();
      update({ isLoading: false });
    };
  }, [isOn, libreMap, scenario, site, update]);

  if (!libreMap || !site) return null;
  return (
    <Control position={controlPosition} order={controlOrder}>
      <Tooltip
        title={isOn ? "Planung ausblenden" : `Planung „${site.title}“ zeigen`}
        placement="right"
      >
        <ControlButtonStyler
          onClick={toggle}
          dataTestId="carma-plan-control"
        >
          <FontAwesomeIcon
            icon={faPersonDigging}
            style={{
              color: panelOpen
                ? CARMA_PLAN_ICON_COLOR.open
                : CARMA_PLAN_ICON_COLOR.closed,
            }}
          />
        </ControlButtonStyler>
      </Tooltip>
    </Control>
  );
};
