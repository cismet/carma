import { useState } from "react";
import { message, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { useLiveDeployment } from "@carma-commons/utils";
import { createGeoportalLink } from "../geoportalLink";

type OpenInGeoportalControlProps = {
  vectorLayers: Parameters<typeof createGeoportalLink>[0];
  label?: string;
};

const OpenInGeoportalControl = ({
  vectorLayers,
  label = "Im Geoportal öffnen",
}: OpenInGeoportalControlProps) => {
  const isLive = useLiveDeployment();
  const [busy, setBusy] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const openInGeoportal = async () => {
    // opened right away: a window opened after the awaits below would count
    // as a popup and get blocked
    const target = window.open("", "_blank");
    setBusy(true);
    try {
      const url = await createGeoportalLink(vectorLayers, isLive);
      if (target) {
        target.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (error) {
      console.error("[GTM→GEOPORTAL] creating the link failed", error);
      target?.close();
      messageApi.error("Die Karte konnte nicht im Geoportal geöffnet werden.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {contextHolder}
      <Tooltip title={label} placement="right">
        <ControlButtonStyler onClick={openInGeoportal} disabled={busy}>
          <FontAwesomeIcon
            icon={busy ? faSpinner : faArrowUpRightFromSquare}
            spin={busy}
          />
        </ControlButtonStyler>
      </Tooltip>
    </>
  );
};

export default OpenInGeoportalControl;
