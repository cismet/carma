import { useMemo } from "react";
import { createPortal } from "react-dom";

import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, theme, Typography } from "antd";

import { CarmaResponsiveInfoBox } from "@carma-commons/ui/components";

import type { ShadowDateState } from "../contracts/shadow-simulation";
import { getSolarPosition, type SolarLocation } from "../core/solar-position";
import { SolarDayTimeControl } from "./SolarDayTimeControl";

export const ShadowSimulationCurveSettings = ({
  location,
  dateState,
  setDateState,
  onClose,
}: {
  location: SolarLocation;
  dateState: ShadowDateState;
  setDateState: (state: ShadowDateState) => void;
  onClose: () => void;
}) => {
  const { token } = theme.useToken();
  const solarPosition = useMemo(
    () => getSolarPosition(dateState, location),
    [dateState, location]
  );

  if (typeof document === "undefined") return null;
  return createPortal(
    <CarmaResponsiveInfoBox
      role="dialog"
      aria-label="Kurvenansicht"
      useControlLayout={false}
      draggable
      dragGripPlacement="auto"
      dragHandleTitle="Kurvenansicht verschieben"
      width={680}
      heading={
        <div
          className="flex w-full items-center justify-between"
          style={{ gap: token.marginXS, padding: 0 }}
        >
          <Typography.Text strong style={{ fontSize: token.fontSize }}>
            Kurvenansicht
          </Typography.Text>
          <Button
            type="text"
            size="small"
            icon={<FontAwesomeIcon icon={faXmark} />}
            aria-label="Kurvenansicht schließen"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
          />
        </div>
      }
      headingColor={token.colorBgContainer}
      headingStyle={{
        color: token.colorText,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: "none",
      }}
      bodyStyle={{
        maxHeight: "calc(100dvh - 180px)",
        overflowY: "auto",
        padding: token.paddingXS,
        backgroundColor: token.colorBgContainer,
      }}
      style={{
        position: "fixed",
        top: 120,
        left: 24,
        zIndex: 5001,
        maxWidth: "calc(100vw - 48px)",
        minWidth: 0,
        pointerEvents: "auto",
        fontFamily: token.fontFamily,
        fontSize: token.fontSize,
        color: token.colorText,
        borderRadius: token.borderRadiusLG,
        boxShadow: token.boxShadowSecondary,
      }}
      content={
        <div className="w-full" data-test-id="shadow-simulation-settings-pane">
          <SolarDayTimeControl
            expanded
            location={location}
            selection={dateState}
            position={solarPosition}
            onChange={setDateState}
          />
        </div>
      }
    />,
    document.body
  );
};
