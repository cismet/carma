import { useEffect } from "react";
import { useLocate } from "@carma-mapping/contexts";
import type { LocateProblem } from "@carma-mapping/contexts";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { faLocationArrow, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip, message } from "antd";
import { isDesktop } from "react-device-detect";

type LibreMapLocateControlProps = {
  disabled?: boolean;
  nativeTooltip?: boolean;
};

/**
 * What the user reads when the mode switches itself off. Without it a
 * declined permission and a device that cannot get a fix both look like a
 * button that stopped spinning and did nothing.
 */
const PROBLEM_WARNINGS: Record<LocateProblem, string> = {
  denied: "Standortfreigabe abgelehnt.",
  unavailable: "Ihr Standort konnte nicht ermittelt werden.",
  timeout: "Die Standortermittlung hat zu lange gedauert.",
  unsupported: "Dieser Browser kann Ihren Standort nicht ermitteln.",
};

/** how long the warning stays, in seconds */
const WARNING_DURATION = 6;

export const LibreMapLocateControl = ({
  disabled = false,
  nativeTooltip = false,
}: LibreMapLocateControlProps) => {
  const {
    isLocationActive,
    hasMapMoved,
    toggle,
    isLoading,
    problem,
  } = useLocate();

  useEffect(() => {
    if (!problem) {
      return;
    }
    void message.warning({
      content: PROBLEM_WARNINGS[problem],
      duration: WARNING_DURATION,
    });
  }, [problem]);

  const show = !isDesktop || isLocationActive || isLoading;

  const cbs = show ? (
    <ControlButtonStyler
      disabled={disabled}
      onClick={toggle}
      dataTestId="libre-location-control"
    >
      <FontAwesomeIcon
        icon={isLoading ? faSpinner : faLocationArrow}
        className={`text-2xl ${
          isLocationActive && !isLoading
            ? hasMapMoved
              ? "text-blue-500"
              : "text-orange-500"
            : ""
        } ${isLoading ? "animate-spin" : ""}`}
        title={
          nativeTooltip
            ? isLocationActive
              ? "Standortanzeige ausschalten"
              : "Standortanzeige einschalten"
            : undefined
        }
      />
    </ControlButtonStyler>
  ) : null;

  return (
    <>
      {nativeTooltip ? (
        cbs
      ) : (
        <Tooltip
          title={
            isLocationActive
              ? "Standortanzeige ausschalten"
              : "Standortanzeige einschalten"
          }
          placement="right"
        >
          {cbs}
        </Tooltip>
      )}
    </>
  );
};
