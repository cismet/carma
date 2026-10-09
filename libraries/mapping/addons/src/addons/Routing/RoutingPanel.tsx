import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDiamondTurnRight,
  faPause,
  faPlay,
} from "@fortawesome/free-solid-svg-icons";
import { ConfigProvider, Slider } from "antd";

import type { SimulatedSignal } from "../LocationSimulator/fakeDevice";
import { useLocationSimulation } from "../LocationSimulator/simulationChannel";
import { useRouteNavigation } from "./routeChannel";

/** the slider's step; a thousandth of the route, the same grain the line's split uses */
const SEEK_STEP = 0.001;

/** the paces the drive can be set to, as multiples of the configured speed */
const SPEED_FACTORS = [0.5, 1, 2, 4];

/** the receptions the pretend device can have, for testing a weak or lost signal */
const SIGNALS: { value: SimulatedSignal; label: string }[] = [
  { value: "good", label: "gut" },
  { value: "poor", label: "ungenau" },
  { value: "off", label: "aus" },
];

/**
 * Sized for a thumb: the ribbon is used on a phone held in one hand, so every
 * target is at least 36 px and the slider has a row of its own. No tooltips:
 * on a touch screen they open on the tap and stay over the controls.
 */
const ICON_BUTTON_CLASS_NAME =
  "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-lg text-gray-600 hover:bg-black/5";

/** a bigger knob and rail than ant's default, so the slider can be dragged with a finger */
const SLIDER_THEME = {
  components: {
    Slider: {
      handleSize: 18,
      handleSizeHover: 20,
      railSize: 6,
      controlSize: 24,
    },
  },
};

const SEGMENT_CLASS_NAME = (active: boolean) =>
  `h-9 cursor-pointer rounded-full border-0 px-3 text-sm tabular-nums ${
    active
      ? "bg-black/10 font-semibold text-gray-800"
      : "bg-transparent text-gray-500 hover:bg-black/5"
  }`;

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
      className="w-[100vw] sm:w-[86vw] sm:max-w-[680px] shrink-0 bg-white rounded-[10px] px-4 py-3 shadow-lg"
      data-test-id="routing-tools"
    >
      {simulation?.driving ? (
        <div className="flex flex-col gap-2 text-sm text-gray-700">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={simulation.paused ? "Weiterfahren" : "Anhalten"}
              onClick={() => simulation.setPaused(!simulation.paused)}
              className={ICON_BUTTON_CLASS_NAME}
            >
              <FontAwesomeIcon icon={simulation.paused ? faPlay : faPause} />
            </button>
            <div
              className="flex items-center gap-1"
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
                    className={SEGMENT_CLASS_NAME(active)}
                  >
                    {factor}×
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              aria-label="Abweichen"
              onClick={simulation.detour}
              className={`${ICON_BUTTON_CLASS_NAME} ml-auto`}
              data-test-id="routing-detour"
            >
              <FontAwesomeIcon icon={faDiamondTurnRight} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <ConfigProvider theme={SLIDER_THEME}>
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
                tooltip={{ open: false }}
                style={{ margin: "0 8px" }}
                aria-label="Position auf der Route"
              />
            </ConfigProvider>
            <span className="w-12 shrink-0 text-right tabular-nums">
              {Math.round((draft ?? fraction) * 100)} %
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div
              className="flex items-center gap-1"
              role="group"
              aria-label="GPS-Signal"
            >
              <span className="mr-1 text-gray-500">Signal</span>
              {SIGNALS.map(({ value, label }) => {
                const active = value === simulation.signal;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => simulation.setSignal(value)}
                    className={SEGMENT_CLASS_NAME(active)}
                    data-test-id={`routing-signal-${value}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {/* there is no Alt key on a phone */}
            <span className="text-xs text-gray-500 max-sm:hidden">
              Alt + Klick in die Karte: Position setzen
            </span>
          </div>
        </div>
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
