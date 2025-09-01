import { Modal, Button } from "antd";
import { useState, useEffect } from "react";

type MobileWarningMessageProps = {
  headerText?: string;
  confirmButtonText?: string;
  bodyText: string;
  isHardMode?: boolean;
  messageWidth?: number;
  hasBeenShown?: boolean;
  onConfirm?: () => void;
};

export const MobileWarningMessage = ({
  headerText = "Hinweis",
  confirmButtonText = "Verstanden",
  bodyText,
  isHardMode = false,
  messageWidth = 600,
  hasBeenShown = false,
  onConfirm = () => {},
}: MobileWarningMessageProps) => {
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [innerWidth, setInnerWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    const handleResize = () => {
      setInnerWidth(window.innerWidth);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const isMobile = innerWidth < messageWidth;

  const handleClick = () => {
    setIsModalOpen(false);
    onConfirm();
  };

  return (
    <Modal
      zIndex={9999}
      title={headerText}
      open={isModalOpen && isMobile && !hasBeenShown}
      closable={false}
      footer={[
        <Button
          key="confirm"
          type="primary"
          onClick={handleClick}
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
