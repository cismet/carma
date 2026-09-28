import { useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faRotateRight,
} from "@fortawesome/free-solid-svg-icons";
import { Checkbox, Slider, Tooltip } from "antd";

import {
  TRAFFIC_DAY_HOUR,
  TRAFFIC_MAX_OFFSET_MINUTES,
  TRAFFIC_NIGHT_HOUR,
  formatTrafficTime,
  type TrafficJump,
} from "@carma-mapping/show-remote";

import { useIsAdminMode } from "../../lib/admin-mode";
import { useTrafficAnimationActions } from "./traffic-actions";

/**
 * The traffic's ribbon under the layer bar, opened from the readout on the
 * launching layer's button: which moment of the last 24 hours the vehicles
 * drive at, as a slider from 24 hours ago to live, and the three jumps "Tag",
 * "Nacht" and "Live" the remote on the phone has as well, like its restart,
 * which throws the vehicles away and fills the roads anew.
 *
 * Collapsed is the whole UI. The chevron opens what is there to read, not to
 * set: how many vehicles are out, how long ago the moment is, and where the
 * numbers come from.
 *
 * Under `?ff=admin` a section below the header draws the network the
 * vehicles are attached to, so a car off its road shows whether the network
 * or the renderer is wrong.
 *
 * The slider runs from -1440 to 0 so that live sits at the right end, where a
 * timeline ends; the channel keeps the offset as a positive number of minutes.
 */

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

const JUMPS: { kind: TrafficJump; label: string; tooltip: string }[] = [
  {
    kind: "day",
    label: "Tag",
    tooltip: `Verkehr um ${TRAFFIC_DAY_HOUR} Uhr zeigen`,
  },
  {
    kind: "night",
    label: "Nacht",
    tooltip: `Verkehr um ${TRAFFIC_NIGHT_HOUR} Uhr zeigen`,
  },
  { kind: "live", label: "Live", tooltip: "Verkehr von jetzt zeigen" },
];

const SegmentButton = ({
  active,
  tooltip,
  onClick,
  children,
}: {
  active: boolean;
  tooltip: string;
  onClick: () => void;
  children: ReactNode;
}) => (
  <Tooltip title={tooltip} placement="top">
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`text-sm rounded-md px-3 py-1 border-0 whitespace-nowrap cursor-pointer ${
        active
          ? "bg-white text-gray-900 shadow-sm"
          : "bg-transparent text-gray-600"
      }`}
    >
      {children}
    </button>
  </Tooltip>
);

export const TrafficPanel = () => {
  const {
    offsetMinutes,
    displayedAt,
    darkness,
    isNight,
    vehicleCount,
    isCapped,
    isLoading,
    error,
    showNetwork,
    setOffsetMinutes,
    jump,
    setShowNetwork,
    restart,
  } = useTrafficAnimationActions();
  const isAdmin = useIsAdminMode();
  const [expanded, setExpanded] = useState(false);

  const shown = displayedAt || Date.now() - offsetMinutes * 60_000;
  /** the jump the moment shown belongs to, so one segment is always lit */
  const activeJump: TrafficJump =
    offsetMinutes === 0 ? "live" : isNight ? "night" : "day";

  const status = error
    ? `Fehler: ${error}`
    : isLoading
    ? "Straßennetz wird geladen …"
    : `${vehicleCount.toLocaleString("de-DE")} Fahrzeuge${
        isCapped ? " (begrenzt)" : ""
      } · ${lightLabel(darkness)} · ${agoLabel(offsetMinutes)}`;

  return (
    <div
      className="w-[100vw] sm:w-[86vw] sm:max-w-[680px] md:max-w-[760px] shrink-0 bg-white rounded-[10px] px-4 py-2 shadow-lg"
      data-test-id="traffic-animation-panel"
    >
      {/* No title here: the layer button the ribbon hangs off already says
          which traffic this is. */}
      <div className="flex items-center gap-3 text-sm text-gray-700">
        <span className="shrink-0 whitespace-nowrap tabular-nums">
          {formatTrafficTime(shown)}
        </span>

        <Slider
          className="grow"
          min={-TRAFFIC_MAX_OFFSET_MINUTES}
          max={0}
          step={1}
          value={-offsetMinutes}
          onChange={(value: number) => setOffsetMinutes(-value)}
          tooltip={{
            formatter: (value) =>
              formatTrafficTime(Date.now() + (value ?? 0) * 60_000),
          }}
          style={{ margin: 0 }}
        />

        <div className="inline-flex shrink-0 items-center rounded-lg bg-gray-100 p-1 gap-1">
          {JUMPS.map(({ kind, label, tooltip }) => (
            <SegmentButton
              key={kind}
              active={activeJump === kind}
              tooltip={tooltip}
              onClick={() => jump(kind)}
            >
              {label}
            </SegmentButton>
          ))}
        </div>

        <Tooltip title="Verkehr neu starten" placement="top">
          <button
            type="button"
            aria-label="Verkehr neu starten"
            onClick={restart}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-gray-600 hover:bg-black/5"
          >
            <FontAwesomeIcon icon={faRotateRight} />
          </button>
        </Tooltip>

        <Tooltip
          title={expanded ? "Details ausblenden" : "Details zeigen"}
          placement="top"
        >
          <button
            type="button"
            aria-label={expanded ? "Details ausblenden" : "Details zeigen"}
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-gray-600 hover:bg-black/5"
          >
            <FontAwesomeIcon
              icon={faChevronDown}
              style={{
                transform: expanded ? "rotate(180deg)" : undefined,
                transition: "transform 150ms",
              }}
            />
          </button>
        </Tooltip>
      </div>

      {/* A failing network is the one thing the collapsed ribbon has to say,
          since the map then just stays empty. */}
      {!expanded && error && (
        <p className="m-0 mt-1 text-sm text-red-600">{status}</p>
      )}

      {isAdmin && (
        <div className="mt-2 border-0 border-t border-solid border-gray-200 pt-2">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            Darstellung
          </h3>
          <Checkbox
            checked={showNetwork}
            onChange={(event) => setShowNetwork(event.target.checked)}
          >
            Straßennetz der Fahrzeuge zeigen
          </Checkbox>
        </div>
      )}

      {expanded && (
        <div className="mt-2 border-0 border-t border-solid border-gray-200 pt-2">
          <p
            className={`m-0 text-sm tabular-nums ${
              error ? "text-red-600" : "text-gray-500"
            }`}
          >
            {status}
          </p>
          <p className="mb-0 mt-1 text-xs leading-snug text-gray-500">
            Straßennetz und Tagesmengen: Verkehrsbelastung 2020. Verlauf über
            den Tag und die letzten 24 Stunden sind erfunden.
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * What the host's interaction view mounts. The `layer` prop the host passes is
 * the launching layer's, which says nothing the channel does not.
 */
export const TrafficInteractionPanel = () => <TrafficPanel />;
