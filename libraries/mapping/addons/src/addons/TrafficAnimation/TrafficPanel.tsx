import { Button, Slider } from "antd";

import {
  TRAFFIC_MAX_OFFSET_MINUTES,
  formatTrafficTime,
} from "@carma-mapping/show-remote";

import type { TrafficAnimationState } from "./traffic-actions";

/**
 * The traffic's panel on a desktop route: which moment of the last 24 hours
 * the vehicles drive at, as a slider from 24 hours ago to live, and the three
 * jumps "Tag", "Nacht" and "Live" the remote on the phone has as well.
 *
 * The slider runs from -1440 to 0 so that live sits at the right end, where a
 * timeline ends; the channel keeps the offset as a positive number of minutes.
 */

const SLIDER_MARKS = {
  [-TRAFFIC_MAX_OFFSET_MINUTES]: "−24 h",
  [-TRAFFIC_MAX_OFFSET_MINUTES / 2]: "−12 h",
  0: "Live",
};

/** "vor 3 h 20 min", or "Live" at 0 */
const agoLabel = (minutes: number): string => {
  if (minutes <= 0) return "Live";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `vor ${rest} min`;
  return rest === 0 ? `vor ${hours} h` : `vor ${hours} h ${rest} min`;
};

const lightLabel = (darkness: number): string =>
  darkness >= 0.5 ? "Nacht" : darkness > 0 ? "Dämmerung" : "Tag";

export type TrafficPanelProps = Pick<
  TrafficAnimationState,
  | "title"
  | "offsetMinutes"
  | "displayedAt"
  | "darkness"
  | "vehicleCount"
  | "isCapped"
  | "isLoading"
  | "error"
> & {
  onOffset: (minutes: number) => void;
  onJump: (kind: "day" | "night" | "live") => void;
};

export const TrafficPanel = ({
  title,
  offsetMinutes,
  displayedAt,
  darkness,
  vehicleCount,
  isCapped,
  isLoading,
  error,
  onOffset,
  onJump,
}: TrafficPanelProps) => {
  const shown = displayedAt || Date.now() - offsetMinutes * 60_000;
  const status = error
    ? `Fehler: ${error}`
    : isLoading
    ? "Straßennetz wird geladen …"
    : `${vehicleCount.toLocaleString("de-DE")} Fahrzeuge${
        isCapped ? " (begrenzt)" : ""
      }`;

  return (
    <div
      className="flex w-[300px] flex-col gap-1.5 rounded-md bg-white px-3 py-2 shadow-lg"
      data-test-id="traffic-animation-panel"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-gray-500">{lightLabel(darkness)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2 text-sm tabular-nums text-gray-700">
        <span>{formatTrafficTime(shown)}</span>
        <span className="text-xs text-gray-500">{agoLabel(offsetMinutes)}</span>
      </div>
      <Slider
        min={-TRAFFIC_MAX_OFFSET_MINUTES}
        max={0}
        step={1}
        marks={SLIDER_MARKS}
        value={-offsetMinutes}
        onChange={(value: number) => onOffset(-value)}
        tooltip={{
          formatter: (value) =>
            formatTrafficTime(Date.now() + (value ?? 0) * 60_000),
        }}
        style={{ margin: "0 8px 18px" }}
      />
      <div className="flex items-center gap-1.5">
        <Button size="small" onClick={() => onJump("day")}>
          Tag
        </Button>
        <Button size="small" onClick={() => onJump("night")}>
          Nacht
        </Button>
        <Button
          size="small"
          type={offsetMinutes === 0 ? "primary" : "default"}
          onClick={() => onJump("live")}
        >
          Live
        </Button>
        <span className="ml-auto text-xs tabular-nums text-gray-500">
          {status}
        </span>
      </div>
      <p className="m-0 text-[11px] leading-snug text-gray-500">
        Straßennetz und Tagesmengen: Verkehrsbelastung 2020. Verlauf über den
        Tag und die letzten 24 Stunden sind erfunden.
      </p>
    </div>
  );
};
