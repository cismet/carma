import { Modal, Button } from "antd";
import { useState, useEffect } from "react";

const MOBILE_WARNING_LAST_SHOWN_KEY = "mobileWarningLastShown";

type MobileWarningMessageProps = {
  headerText?: string;
  confirmButtonText?: string;
  bodyText: string;
  isHardMode?: boolean;
  messageWidth?: number;
  hasBeenShown?: boolean;
  onConfirm?: () => void;
  messageId?: string;
};

export const MobileWarningMessage = ({
  headerText = "Hinweis",
  confirmButtonText = "Verstanden",
  bodyText,
  isHardMode = false,
  messageWidth = 600,
  hasBeenShown = false,
  onConfirm = () => {},
  messageId,
}: MobileWarningMessageProps) => {
  const storageKey = `${MOBILE_WARNING_LAST_SHOWN_KEY}_${
    messageId || bodyText.substring(0, 20)
  }`;

  const [wasShownToday, setWasShownToday] = useState(() => {
    try {
      const lastShownDate = localStorage.getItem(storageKey);
      if (lastShownDate) {
        const today = new Date().toDateString();
        return lastShownDate === today;
      }
      return false;
    } catch (error) {
      console.error("Error accessing localStorage:", error);
      return false;
    }
  });

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
    try {
      const today = new Date().toDateString();
      localStorage.setItem(storageKey, today);
      setWasShownToday(true);
    } catch (error) {
      console.error("Error writing to localStorage:", error);
    }
    onConfirm();
  };

  return (
    <Modal
      zIndex={9999}
      title={headerText}
      open={isModalOpen && isMobile && !hasBeenShown && !wasShownToday}
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
