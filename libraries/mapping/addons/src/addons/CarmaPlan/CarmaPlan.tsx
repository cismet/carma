import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  CARMA_PLAN_SCENARIOS,
  type CarmaPlanScenario,
  type CarmaPlanScenarioId,
} from "./scenario";
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

/** pause before building the next scenario in the background, so the map
 * stays usable between the builds (each blocks for about a second) */
const BACKGROUND_BUILD_DELAY_MS = 1500;

/** pause before building the chosen scenario, so the frame with reality on
 * the site is drawn before the build blocks the page */
const CHOSEN_BUILD_DELAY_MS = 100;

/** what the site switches to by itself the first time the plan is on */
const FIRST_SCENARIO: CarmaPlanScenarioId = "construction";

const NONE_READY: readonly CarmaPlanScenarioId[] = [];

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** the scenarios built for a site, kept so showing one again is instant */
type BuiltScenarios = {
  site: CarmaPlanSite;
  scenarios: Map<CarmaPlanScenarioId, CarmaPlanScenario>;
};

const disposeBuilt = (built: BuiltScenarios | null): void => {
  built?.scenarios.forEach((scenario) => scenario.dispose());
  built?.scenarios.clear();
};

const builtOn = (
  built: BuiltScenarios | null,
  site: CarmaPlanSite,
  id: CarmaPlanScenarioId
): CarmaPlanScenario | undefined =>
  built?.site === site ? built.scenarios.get(id) : undefined;

/** scenario `id` on `site`, built now unless it was built before */
const scenarioOn = (
  kept: { current: BuiltScenarios | null },
  id: CarmaPlanScenarioId,
  site: CarmaPlanSite,
  ground: GroundSampler,
  reason: "shown" | "background"
): CarmaPlanScenario => {
  if (kept.current?.site !== site) {
    disposeBuilt(kept.current);
    kept.current = { site, scenarios: new Map() };
  }
  const known = kept.current.scenarios.get(id);
  if (known) return known;
  const built = buildCarmaPlanScenario(id, site, ground);
  console.info(
    "[CARMA PLAN]",
    id,
    site.title,
    reason,
    JSON.stringify(built.stats)
  );
  kept.current.scenarios.set(id, built);
  return built;
};

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
 *
 * A scenario shows only once it is built. Until then the site keeps the mesh
 * and the panel keeps the scenario disabled; the first time the plan is on,
 * it switches to the construction site by itself once that is built.
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
  const builtRef = useRef<BuiltScenarios | null>(null);
  // scenarios whose build threw, left out of the background builds
  const failedRef = useRef(new Set<CarmaPlanScenarioId>());
  // the site the plan has switched to FIRST_SCENARIO by itself
  const startedRef = useRef<CarmaPlanSite | null>(null);
  // the scenarios built for a site, the ones that can be shown
  const [readyOn, setReadyOn] = useState<{
    site: CarmaPlanSite;
    ids: readonly CarmaPlanScenarioId[];
  } | null>(null);
  // a scenario chosen before it was built; the site shows reality until it is
  const [target, setTarget] = useState<CarmaPlanScenarioId | null>(null);

  const ready = useMemo(
    () => (readyOn && readyOn.site === site ? readyOn.ids : NONE_READY),
    [readyOn, site]
  );

  useEffect(
    () => () => {
      disposeBuilt(builtRef.current);
      builtRef.current = null;
    },
    []
  );

  useEffect(() => {
    update({ ready });
  }, [ready, update]);

  useEffect(() => {
    update({ isLoading: target !== null });
  }, [target, update]);

  useEffect(() => {
    if (!siteUrl) return;
    const abort = new AbortController();
    loadCarmaPlanSite(siteUrl, abort.signal)
      .then((loaded) => {
        failedRef.current.clear();
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

  // a scenario is shown only once it is built; until then reality stays
  const shown =
    isOn && scenario !== "reality" && ready.includes(scenario)
      ? scenario
      : null;
  const planned = shown !== null;

  // a scenario chosen before it is built becomes the target and the site
  // shows reality meanwhile; the first time the plan is on, the target is
  // FIRST_SCENARIO
  useEffect(() => {
    if (!site || !isOn) return;
    if (scenario === "reality") {
      if (startedRef.current !== site && ready.length === 0 && !target) {
        startedRef.current = site;
        setTarget(FIRST_SCENARIO);
      }
      return;
    }
    startedRef.current = site;
    if (ready.includes(scenario)) {
      // a built scenario picked while another is pending: the pick wins
      setTarget(null);
      return;
    }
    setTarget(scenario);
    update({ scenario: "reality", error: null });
  }, [isOn, ready, scenario, site, target, update]);

  // the target first, then the others one by one in the background, so
  // switching to any of them is instant
  useEffect(() => {
    if (!site || !isOn) return;
    let cancelled = false;
    let timer: number | undefined;
    if (groundRef.current?.site !== site)
      groundRef.current = {
        site,
        ground: loadGroundSampler(boxOfPolygons(site.polygons)),
      };
    const { ground } = groundRef.current;

    const unbuilt = (id: CarmaPlanScenarioId) =>
      !builtOn(builtRef.current, site, id) && !failedRef.current.has(id);

    if (target && !unbuilt(target)) {
      setTarget(null);
      if (builtOn(builtRef.current, site, target)) update({ scenario: target });
      return;
    }

    const buildNext = (sampler: GroundSampler) => {
      if (cancelled) return;
      const id =
        target ?? CARMA_PLAN_SCENARIOS.find((entry) => unbuilt(entry.id))?.id;
      if (!id) return;
      const isTarget = id === target;
      timer = window.setTimeout(
        () => {
          if (cancelled) return;
          try {
            scenarioOn(
              builtRef,
              id,
              site,
              sampler,
              isTarget ? "shown" : "background"
            );
          } catch (error: unknown) {
            console.error("[CARMA PLAN]", id, error);
            failedRef.current.add(id);
            if (isTarget) {
              setTarget(null);
              update({ error: `Szenario nicht gebaut: ${messageOf(error)}` });
            } else buildNext(sampler);
            return;
          }
          setReadyOn({
            site,
            ids: [...(builtRef.current?.scenarios.keys() ?? [])],
          });
          // clearing the target runs this effect again for the rest
          if (isTarget) {
            setTarget(null);
            update({ scenario: id });
          } else buildNext(sampler);
        },
        isTarget ? CHOSEN_BUILD_DELAY_MS : BACKGROUND_BUILD_DELAY_MS
      );
    };

    void ground.then(buildNext, (error: unknown) => {
      if (cancelled) return;
      console.error("[CARMA PLAN]", error);
      setTarget(null);
      update({ error: `Szenario nicht gebaut: ${messageOf(error)}` });
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOn, site, target, update]);

  // the hole stays while any built scenario is shown, so switching between
  // them never lets the mesh flash through
  useEffect(() => {
    if (!libreMap || !site || !planned) return;
    return setTiles3dCutout(libreMap, CUTOUT_ID, site.polygons);
  }, [libreMap, site, planned]);

  useEffect(() => {
    if (!libreMap || !site || !shown) return;
    const scene = builtOn(builtRef.current, site, shown);
    if (!scene) return;
    return mountScenario(libreMap, scene);
  }, [libreMap, shown, site]);

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
