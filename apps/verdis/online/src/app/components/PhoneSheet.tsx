import { Modal } from "react-bootstrap";
import type { ReactNode } from "react";
import PhoneCloseButton from "./changerequests/PhoneCloseButton";
import "./changerequests/CR00MainComponent.css";
import "./PhoneSheet.css";

interface PhoneSheetProps {
  show: boolean;
  onHide: () => void;
  title: ReactNode;
  children?: ReactNode;
}

const PhoneSheet = ({ show, onHide, title, children }: PhoneSheetProps) => {
  return (
    <Modal
      show={show}
      onHide={onHide}
      dialogClassName="phone-sheet"
      contentClassName="phone-sheet-content"
    >
      <div className="phone-sheet-header">
        <h2 className="phone-sheet-title">{title}</h2>
        <PhoneCloseButton onClick={onHide} />
      </div>
      <div className="phone-sheet-body">{children}</div>
    </Modal>
  );
};

export default PhoneSheet;
