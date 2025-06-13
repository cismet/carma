import { Modal, Button } from "antd";
import { useState } from "react";

type MobileWarningMessageProps = {
  headerText?: string;
  confirmButtonText?: string;
  bodyText: string;
};

export const MobileWarningMessage = ({
  headerText = "Hinweis",
  confirmButtonText = "Verstanden",
  bodyText,
}: MobileWarningMessageProps) => {
  const [isModalOpen, setIsModalOpen] = useState(true);
  const isMobile = window.innerWidth < 600;
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
        >
          {confirmButtonText}
        </Button>,
      ]}
    >
      <p>{bodyText}</p>
    </Modal>
  );
};
