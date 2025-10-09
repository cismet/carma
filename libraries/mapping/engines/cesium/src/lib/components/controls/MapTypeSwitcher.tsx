import {
  type MouseEvent,
  type ReactNode,
  forwardRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useSelector } from "react-redux";
import { Tooltip } from "antd";

import UAParser from "ua-parser-js";

import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import { useMapTransition } from "../../hooks/useMapTransition";
import { selectViewerIsMode2d } from "../../slices/cesium";

type Props = {
  duration?: number;
  onComplete?: (isTo2D: boolean) => void;
  onCancel?: (isTo2D: boolean) => void;
  children?: ReactNode;
  className?: string;
  nativeTooltip?: boolean;
  enableMobileWarning?: boolean;
};

const parser = new UAParser();
const isMobileUA = parser.getDevice().type === "mobile";
const isTabletUA = parser.getDevice().type === "tablet";
const isMobileOrTablet = isMobileUA || isTabletUA;

const LOCALE_DE_WARNING_ENABLE_CESIUM_MODE = `Achtung ⚠️

Die 3D-Darstellung stellt hohe Anforderungen an die Speicherausstattung Ihres Endgerätes. Bei leistungsschwächeren Geräten funktioniert der 3D-Modus eventuell nicht stabil.`;

const LOCALE_DE_SWITCH_TO_3D_MODE = `Zur 3D-Ansicht wechseln`;
const LOCALE_DE_SWITCH_TO_2D_MODE = `Zur 2D-Ansicht wechseln`;

type Ref = HTMLButtonElement;

export const MapTypeSwitcher = forwardRef<Ref, Props>(
  (
    {
      onComplete,
      onCancel,
      duration,
      className,
      nativeTooltip = false,
      enableMobileWarning = false,
    },
    ref
  ) => {
    const [hasConfirmed, setHasConfirmed] = useState(false);
    const [disabled, setDisabled] = useState(false);
    const isMode2d = useSelector(selectViewerIsMode2d);

    const switchInfoText = isMode2d
      ? LOCALE_DE_SWITCH_TO_3D_MODE
      : LOCALE_DE_SWITCH_TO_2D_MODE;

    const onCompleteStable = useCallback(
      (isTo2D: boolean) => {
        onComplete?.(isTo2D);
        setDisabled(false);
      },
      [onComplete]
    );

    const onCancelStable = useCallback(
      (isTo2D: boolean) => {
        onCancel?.(isTo2D);
        setDisabled(false);
      },
      [onCancel]
    );

    const transitionOptions = useMemo(
      () => ({
        onComplete: onCompleteStable,
        onCancel: onCancelStable,
        duration,
      }),
      [onCompleteStable, onCancelStable, duration]
    );

    const { transitionToMode2d, transitionToMode3d } =
      useMapTransition(transitionOptions);

    const handleSwitchMapMode = useCallback(
      async (e: MouseEvent) => {
        e.preventDefault();

        if (
          // show warning only from 2d mode and not already confirmed
          isMode2d &&
          !hasConfirmed &&
          enableMobileWarning &&
          isMobileOrTablet
        ) {
          const confirmed = window.confirm(
            LOCALE_DE_WARNING_ENABLE_CESIUM_MODE
          );
          if (confirmed) {
            setHasConfirmed(true);
          } else {
            return;
          }
        }

        console.debug(
          "CLICKHANDLER: [CESIUM|LEAFLET|2D3D] clicked handleSwitchMapMode zoom",
          isMode2d
        );
        setDisabled(true);
        try {
          if (isMode2d) {
            await transitionToMode3d();
          } else {
            await transitionToMode2d();
          }
        } catch (error) {
          console.error("Map transition failed:", error);
          setDisabled(false);
        }
      },
      [
        isMode2d,
        hasConfirmed,
        enableMobileWarning,
        transitionToMode3d,
        transitionToMode2d,
      ]
    );

    console.debug(
      "RENDER: [CESIUM|LEAFLET|2D3D] MapTypeSwitcher",
      isMode2d,
      disabled
    );

    const cbs = (
      <ControlButtonStyler
        className={"font-semibold " + className}
        onClick={handleSwitchMapMode}
        disabled={disabled}
        ref={ref}
        title={nativeTooltip ? switchInfoText : undefined}
        dataTestId={isMode2d ? "3d-control" : "2d-control"}
      >
        {isMode2d ? "3D" : "2D"}
      </ControlButtonStyler>
    );
    return nativeTooltip ? (
      cbs
    ) : (
      <Tooltip title={switchInfoText} placement="right">
        {cbs}
      </Tooltip>
    );
  }
);

export default MapTypeSwitcher;
