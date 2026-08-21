import type { ReactNode } from "react";
import { Modal } from "antd";

import "./input.css";
import "./modal.css";

interface ModalShellProps {
  open: boolean;
  /** preview mode parks the modal at the lower screen edge without a mask */
  preview: boolean;
  onCancel: () => void;
  afterOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

/** the outer antd modal of the layer catalog, including the preview parking */
const ModalShell = ({
  open,
  preview,
  onCancel,
  afterOpenChange,
  children,
}: ModalShellProps) => (
  <Modal
    open={open}
    afterOpenChange={afterOpenChange}
    classNames={{
      content: "modal-content",
    }}
    onCancel={onCancel}
    style={{
      top: preview ? "84%" : undefined,
      transition: "top 400ms linear",
    }}
    mask={!preview}
    footer={<></>}
    width={"100%"}
    closeIcon={false}
    wrapClassName="h-full !overflow-y-hidden hide-tabs"
    className="h-[88%]"
    styles={{
      content: {
        backgroundColor: "#f2f2f2",
      },
    }}
  >
    {children}
  </Modal>
);

export default ModalShell;
