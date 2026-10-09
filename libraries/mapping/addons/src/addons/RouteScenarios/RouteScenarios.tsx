import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFlask } from "@fortawesome/free-solid-svg-icons";
import { Dropdown, type MenuProps } from "antd";

import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import { fetchRoute, getModeIcon, getModeLabel } from "@carma-mapping/routing";

import type { AddonComponentProps } from "../../lib/registry";
import { useLocationSimulation } from "../LocationSimulator/simulationChannel";
import { RoutePreview } from "../RoutePreview";
import { useActiveRoute, useReleaseActiveRoute } from "../Routing/routeChannel";
import { travelModeOf } from "../Routing/routeMode";
import { useRouteMode } from "../Routing/routeModeChannel";
import {
  DEFAULT_CONTROL_ORDER,
  DEFAULT_CONTROL_POSITION,
  DEFAULT_SCENARIOS,
  type RouteScenario,
} from "./config";

/** what the route in focus says it came from */
const ROUTE_SOURCE = "routeScenarios";

/** active-control blue, as used by the other geoportal controls */
const ACTIVE_COLOR = "#1677ff";

type Status = { text: string; error?: boolean } | null;

/**
 * Fixed routes to test the navigation on, dev only.
 *
 * "In der Nähe" gives whatever is nearest: no stairs on purpose, no motorway,
 * no way to repeat the same turn twice. A scenario is a route made for a set
 * of features (`DEFAULT_SCENARIOS`, or `scenarios` in the config), picked from
 * a dropdown behind a button in the control column:
 *
 * 1. the mode goes onto the `routeMode` channel, so the picker shows it and a
 *    reroute asks by it;
 * 2. the pretend user is put at the start (`place` on `locationSimulation`);
 * 3. the route is asked for live (`fetchRoute`), so it has today's steps;
 * 4. it goes on `activeRoute` as a route from the user's own position, with
 *    the scenario's name as its label.
 *
 * There is no picked feature and so no info box with the route button; the
 * preview (`RoutePreview`) draws the line, fits the map around it and offers
 * "Starten" itself.
 *
 * Dev only like the simulator it drives: outside a dev build it renders
 * nothing, so an entry left on a route does nothing in a deployment.
 */
export const RouteScenarios = ({
  config,
  libreMap,
}: AddonComponentProps<"routeScenarios">) => {
  const {
    scenarios = DEFAULT_SCENARIOS,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
  } = config ?? {};
  const enabled = import.meta.env.DEV;

  const [focused, setActiveRoute] = useActiveRoute();
  const releaseActiveRoute = useReleaseActiveRoute();
  const [, setMode] = useRouteMode();
  const simulation = useLocationSimulation();
  // read when a scenario is picked, not a reason to rebuild the pick
  const simulationRef = useRef(simulation);
  simulationRef.current = simulation;

  const [status, setStatus] = useState<Status>(null);
  /** counts the picks, so the answer to an earlier one is dropped */
  const pickRef = useRef(0);

  const pick = useCallback(
    (scenario: RouteScenario) => {
      const run = ++pickRef.current;
      setMode(scenario.mode);
      simulationRef.current?.place(scenario.from);
      // the old route goes at once, so the card says what is happening
      // rather than showing the previous scenario under the new name
      releaseActiveRoute(ROUTE_SOURCE);
      setStatus({ text: `${scenario.label}: Route wird berechnet…` });
      const [fromLng, fromLat] = scenario.from;
      const [toLng, toLat] = scenario.to;
      void fetchRoute({
        from: { lng: fromLng, lat: fromLat },
        to: { lng: toLng, lat: toLat },
        mode: travelModeOf(scenario.mode),
      }).then((summary) => {
        if (pickRef.current !== run) {
          return;
        }
        if (!summary || summary.coordinates.length < 2) {
          console.warn("[ROUTE SCENARIOS] no route", { scenario });
          setStatus({
            text: `${scenario.label}: keine Route gefunden`,
            error: true,
          });
          return;
        }
        setStatus(null);
        setActiveRoute({
          source: ROUTE_SOURCE,
          coordinates: summary.coordinates,
          label: scenario.label,
          durationInSeconds: summary.durationInSeconds,
          distanceInMeters: summary.distanceInMeters,
          steps: summary.steps,
          mode: scenario.mode,
          // the pretend user is put at its start, so it is driven from the
          // device's own position
          fromOwnPosition: true,
        });
      });
    },
    [setMode, setActiveRoute, releaseActiveRoute]
  );

  const close = useCallback(() => {
    pickRef.current++;
    setStatus(null);
    releaseActiveRoute(ROUTE_SOURCE);
  }, [releaseActiveRoute]);

  // another producer's route in focus (a picked hit, a long-pressed point)
  // takes over: a scenario still on its way is dropped, and so is its card
  const othersRoute = focused !== null && focused.source !== ROUTE_SOURCE;
  useEffect(() => {
    if (othersRoute) {
      pickRef.current++;
      setStatus(null);
    }
  }, [othersRoute]);

  // the scenario's route goes with the addon
  useEffect(() => () => releaseActiveRoute(ROUTE_SOURCE), [releaseActiveRoute]);

  if (!enabled || !libreMap) {
    return null;
  }

  const active = focused?.source === ROUTE_SOURCE ? focused.label : undefined;
  const items: MenuProps["items"] = scenarios.map((scenario) => ({
    key: scenario.id,
    icon: (
      <FontAwesomeIcon
        icon={getModeIcon(scenario.mode)}
        title={getModeLabel(scenario.mode)}
        fixedWidth
      />
    ),
    label: (
      <div className="flex flex-col leading-tight">
        <span className={active === scenario.label ? "font-semibold" : ""}>
          {scenario.label}
        </span>
        {scenario.tests && (
          <span className="text-xs text-gray-500">{scenario.tests}</span>
        )}
      </div>
    ),
  }));
  const onMenuClick: MenuProps["onClick"] = ({ key }) => {
    const scenario = scenarios.find((one) => one.id === key);
    if (scenario) {
      pick(scenario);
    }
  };

  return (
    <>
      <Control position={controlPosition} order={controlOrder}>
        <Dropdown
          trigger={["click"]}
          placement="bottomRight"
          menu={{ items, onClick: onMenuClick }}
        >
          <ControlButtonStyler
            dataTestId="route-scenarios-control"
            title="Testrouten"
          >
            <FontAwesomeIcon
              icon={faFlask}
              style={active ? { color: ACTIVE_COLOR } : undefined}
            />
          </ControlButtonStyler>
        </Dropdown>
      </Control>
      <RoutePreview
        libreMap={libreMap}
        source={ROUTE_SOURCE}
        onClose={close}
        status={status}
      />
    </>
  );
};
