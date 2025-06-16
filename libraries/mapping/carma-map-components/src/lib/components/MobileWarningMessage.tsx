import { Modal, Button } from "antd";
import { useState } from "react";

type MobileWarningMessageProps = {
  headerText?: string;
  confirmButtonText?: string;
  bodyText: string;
  isHardMode?: boolean;
  messageWidth?: number;
};

export const MobileWarningMessage = ({
  headerText = "Hinweis",
  confirmButtonText = "Verstanden",
  bodyText,
  isHardMode = false,
  messageWidth = 600,
}: MobileWarningMessageProps) => {
  const [isModalOpen, setIsModalOpen] = useState(true);
  const isMobile = window.innerWidth < messageWidth;
  return (
    <Modal
      title={headerText}
      open={isModalOpen && isMobile}
      closable={false}
      closeIcon={false}
      footer={[
        <Button
          key="confirm"
          type="primary"
          onClick={() => setIsModalOpen(false)}
          disabled={isHardMode}
        >
          {confirmButtonText}
        </Button>,
      ]}
    >
      <p>{bodyText}</p>
    </Modal>
  );
};
