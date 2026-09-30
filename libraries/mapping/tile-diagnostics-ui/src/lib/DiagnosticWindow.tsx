import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { StyleProvider } from "@ant-design/cssinjs";
import panelCss from "./TileLoadingDebugPanels.css?inline";

export type DiagnosticWindowProps = {
  open: boolean;
  title: string;
  width: number;
  height: number;
  onClose: () => void;
  children: ReactNode;
};

/** Renders its children into a separate browser window that stays in sync through React. */
export const DiagnosticWindow = ({
  open,
  title,
  width,
  height,
  onClose,
  children,
}: DiagnosticWindowProps) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) {
      setContainer(null);
      return;
    }
    const popup = window.open(
      "",
      title.replace(/\W+/g, "-"),
      `popup,width=${width},height=${height}`
    );
    if (!popup) {
      onClose();
      return;
    }
    popup.document.title = title;
    Object.assign(popup.document.body.style, {
      margin: "0",
      padding: "0",
      font: "12px monospace",
      background: "#fff",
      overflow: "hidden",
    });
    const root = popup.document.createElement("div");
    root.style.height = "100vh";
    root.style.position = "relative";
    popup.document.body.appendChild(root);
    setContainer(root);
    const poll = window.setInterval(() => {
      if (popup.closed) onClose();
    }, 500);
    return () => {
      window.clearInterval(poll);
      setContainer(null);
      if (!popup.closed) popup.close();
    };
    // The window is opened once per `open`; the title is a constant per panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return container
    ? createPortal(
        <StyleProvider container={container.ownerDocument.head}>
          <style>{panelCss}</style>
          {children}
        </StyleProvider>,
        container
      )
    : null;
};
