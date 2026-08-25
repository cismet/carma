import { useCallback, useEffect, useState } from "react";

import { Modal, Tooltip } from "antd";
import { faPuzzlePiece } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import type { AddonComponentProps } from "../../lib/registry";
import { AddonPanel } from "./AddonPanel";

export type AddonManagerConfig = {
  showControl?: boolean;
  controlPosition?: Positions;
  controlOrder?: number;
  storageKey?: string;
};

const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 90;

const AddonManagerButton = ({ onClick }: { onClick: () => void }) => (
  <Tooltip title="Addons anzeigen" placement="right">
    <ControlButtonStyler onClick={onClick} dataTestId="addon-manager-control">
      <FontAwesomeIcon icon={faPuzzlePiece} />
    </ControlButtonStyler>
  </Tooltip>
);

export const AddonManager = ({
  config = {},
}: AddonComponentProps<"addonManager">) => {
  const {
    showControl = true,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
  } = config;
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {showControl && (
        <Control position={controlPosition} order={controlOrder}>
          <AddonManagerButton onClick={() => setIsOpen(true)} />
        </Control>
      )}
      <Modal
        open={isOpen}
        onCancel={() => setIsOpen(false)}
        title="Addons"
        footer={null}
        width={700}
      >
        <AddonPanel />
      </Modal>
    </>
  );
};
