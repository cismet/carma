import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDiamondTurnRight,
  faPause,
  faPlay,
} from "@fortawesome/free-solid-svg-icons";
import { Slider, Tooltip } from "antd";

import { useLocationSimulation } from "../LocationSimulator/simulationChannel";
import { useRouteNavigation } from "./routeChannel";

/** the slider's step; a thousandth of the route, the same grain the line's split uses */
const SEEK_STEP = 0.001;

/** the paces the drive can be set to, as multiples of the configured speed */
const SPEED_FACTORS = [0.5, 1, 2, 4];

/**
 * The ribbon under the layer bar while a navigation runs.
 *
 * What it holds today is a test harness: a slider over the route, a pause
 * button, a speed selector and "Abweichen", which move the pretend device of the
 * `locationSimulator` addon. The slider's knob sits where the routing says
 * the user is (its `progress`), so it goes along on its own while the drive
 * runs, and dragging it puts the device there at once: the camera, the
 * countdown and the line all react as they would to a real fix at that spot,
 * which is what makes every corner of a route checkable without driving to
 * it first. The speed is for the stretches in between: a long route at 4×,
 * a tricky junction at half pace. A real device cannot be moved, so without
 * the simulator the row does not open the ribbon at all (`useRoutingLayerRow`);
 * the text below is the guard for a host that opens it anyway.
 */
export const RoutingPanel = () => {
  const navigation = useRouteNavigation();
  const simulation = useLocationSimulation();
  const fraction = navigation?.progress?.fraction ?? 0;

  // while the hand is on the knob its value is the hand's, not the next
  // fix's, which would pull the knob back a step behind the drag
  const [draft, setDraft] = useState<number | null>(null);

  return (
    <div
      className="w-[100vw] sm:w-[86vw] sm:max-w-[680px] shrink-0 bg-white rounded-[10px] px-4 py-2 shadow-lg"
      data-test-id="routing-tools"
    >
      {simulation?.driving ? (
        <>
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <Tooltip
              title={simulation.paused ? "Weiterfahren" : "Anhalten"}
              placement="top"
            >
              <button
                type="button"
                aria-label={simulation.paused ? "Weiterfahren" : "Anhalten"}
                onClick={() => simulation.setPaused(!simulation.paused)}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-gray-600 hover:bg-black/5"
              >
                <FontAwesomeIcon icon={simulation.paused ? faPlay : faPause} />
              </button>
            </Tooltip>
            <div
              className="flex shrink-0 items-center gap-0.5"
              role="group"
              aria-label="Geschwindigkeit"
            >
              {SPEED_FACTORS.map((factor) => {
                const active = factor === simulation.speedFactor;
                return (
                  <button
                    key={factor}
                    type="button"
                    aria-pressed={active}
                    onClick={() => simulation.setSpeedFactor(factor)}
                    className={`h-7 cursor-pointer rounded-full border-0 px-2 text-xs tabular-nums ${
                      active
                        ? "bg-black/10 font-semibold text-gray-800"
                        : "bg-transparent text-gray-500 hover:bg-black/5"
                    }`}
                  >
                    {factor}×
                  </button>
                );
              })}
            </div>
            <Tooltip
              title="Rechts abbiegen und die Route verlassen, um die Neuberechnung zu testen"
              placement="top"
            >
              <button
                type="button"
                aria-label="Abweichen"
                onClick={simulation.detour}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-gray-600 hover:bg-black/5"
                data-test-id="routing-detour"
              >
                <FontAwesomeIcon icon={faDiamondTurnRight} />
              </button>
            </Tooltip>
            <span className="shrink-0 whitespace-nowrap">
              Position auf der Route
            </span>
            <Slider
              className="grow"
              min={0}
              max={1}
              step={SEEK_STEP}
              value={draft ?? fraction}
              onChange={(value) => {
                setDraft(value);
                simulation.seek(value);
              }}
              onChangeComplete={() => setDraft(null)}
              tooltip={{
                formatter: (value) => `${Math.round((value ?? 0) * 100)} %`,
              }}
              style={{ margin: 0 }}
            />
            <span className="w-10 shrink-0 text-right tabular-nums">
              {Math.round((draft ?? fraction) * 100)} %
            </span>
          </div>
          <p className="m-0 text-xs text-gray-500">
            Alt + Klick in die Karte: Position setzen
          </p>
        </>
      ) : (
        <p className="m-0 text-sm text-gray-500">
          Die Position kommt vom Gerät und lässt sich hier nicht verschieben.
        </p>
      )}
    </div>
  );
};

/** what the host mounts for the row's interaction button */
export const RoutingInteractionPanel = () => <RoutingPanel />;
