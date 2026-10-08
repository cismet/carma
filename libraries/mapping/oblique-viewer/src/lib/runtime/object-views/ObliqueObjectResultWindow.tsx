import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { createCache, StyleProvider } from "@ant-design/cssinjs";
import { Alert, Button, ConfigProvider, Modal, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExternalLink,
  faWindowRestore,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

type OwnedWindow = { window: Window; removeListeners: () => void };

/** Move one live result tree between documents without replacing its image pool. */
export const ObliqueObjectResultWindow = ({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) => {
  const [host] = useState(() => {
    const element = document.createElement("div");
    element.dataset.obliqueObjectWindow = "true";
    Object.assign(element.style, {
      position: "relative",
      width: "100%",
      height: "100%",
    });
    return element;
  });
  const mainDocument = useRef(host.ownerDocument).current;
  const dock = useRef<HTMLDivElement | null>(null);
  const owned = useRef<OwnedWindow | null>(null);
  const [popup, setPopup] = useState<Window | null>(null);
  const [popupError, setPopupError] = useState<string | null>(null);
  const styleContainer = popup?.document.head ?? mainDocument.head;
  const styleCache = useMemo(() => createCache(), [styleContainer]);

  const notifyResize = useCallback(() => {
    // ResizeObservers follow the moved element; also notify listeners belonging
    // to its new document, including when the window has a different DPR.
    const event = host.ownerDocument.createEvent("Event");
    event.initEvent("resize", false, false);
    host.ownerDocument.defaultView?.dispatchEvent(event);
    const adopted = host.ownerDocument.createEvent("Event");
    adopted.initEvent("oblique-object-window-change", false, false);
    host.dispatchEvent(adopted);
  }, [host]);

  const restoreDialog = useCallback(() => {
    const current = owned.current;
    if (!current) return;
    owned.current = null;
    current.removeListeners();
    if (dock.current) dock.current.appendChild(host);
    setPopup(null);
    if (!current.window.closed) current.window.close();
    notifyResize();
  }, [host, notifyResize]);

  const closeResults = () => {
    restoreDialog();
    onClose();
  };

  const attachDock = useCallback(
    (element: HTMLDivElement | null) => {
      dock.current = element;
      if (element && !owned.current) {
        element.appendChild(host);
        notifyResize();
      }
    },
    [host, notifyResize]
  );

  const openWindow = () => {
    if (owned.current) {
      owned.current.window.focus();
      return;
    }
    // Keep window.open on the original click stack so popup admission is a
    // direct user gesture. A blank target never reuses an unrelated window.
    const opened = mainDocument.defaultView?.open(
      "",
      "_blank",
      "popup,width=1440,height=1000"
    );
    if (!opened) {
      setPopupError(
        "Das externe Fenster wurde blockiert. Die Objektansichten bleiben hier geöffnet."
      );
      return;
    }
    try {
      const doc = opened.document;
      doc.title = "Objektansichten";
      const base = doc.createElement("base");
      base.href = mainDocument.baseURI;
      doc.head.appendChild(base);
      // Application styles (including the carousel) remain available outside
      // the main document. Cache-owned AntD styles are not cloned: this
      // document's StyleProvider owns their insertion and cleanup.
      mainDocument
        .querySelectorAll(
          'link[rel="stylesheet"], style:not([data-css-hash]):not([data-token-hash])'
        )
        .forEach((style) => {
          doc.head.appendChild(style.cloneNode(true));
        });
      Object.assign(doc.body.style, {
        margin: "0",
        height: "100dvh",
        overflow: "hidden",
        background: "#fff",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      });
      doc.body.appendChild(host);
      const poll = mainDocument.defaultView!.setInterval(() => {
        if (opened.closed) restoreDialog();
      }, 500);
      const closed = () => restoreDialog();
      opened.addEventListener("pagehide", closed);
      opened.addEventListener("beforeunload", closed);
      owned.current = {
        window: opened,
        removeListeners: () => {
          mainDocument.defaultView!.clearInterval(poll);
          opened.removeEventListener("pagehide", closed);
          opened.removeEventListener("beforeunload", closed);
        },
      };
      setPopup(opened);
      setPopupError(null);
      notifyResize();
      opened.focus();
    } catch {
      if (owned.current?.window === opened) restoreDialog();
      else {
        dock.current?.appendChild(host);
        if (!opened.closed) opened.close();
      }
      setPopupError(
        "Das externe Fenster konnte nicht geöffnet werden. Die Objektansichten bleiben hier geöffnet."
      );
    }
  };

  useEffect(
    () => () => {
      const current = owned.current;
      owned.current = null;
      current?.removeListeners();
      if (current && !current.window.closed) current.window.close();
    },
    []
  );

  return (
    <>
      <Modal
        title={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              minWidth: 0,
              paddingRight: 28,
            }}
          >
            <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
              Objektansichten
            </span>
            <Tooltip title="In externem Fenster öffnen">
              <Button
                size="small"
                aria-label="In externem Fenster öffnen"
                onClick={openWindow}
                icon={<FontAwesomeIcon icon={faExternalLink} />}
              />
            </Tooltip>
          </div>
        }
        open={!popup}
        forceRender
        closeIcon={<FontAwesomeIcon icon={faXmark} />}
        width="calc(100vw - 32px)"
        style={{ top: 16, paddingBottom: 0, maxWidth: "none" }}
        styles={{
          content: { padding: 12, backgroundColor: "#f2f2f2" },
          body: {
            display: "flex",
            flexDirection: "column",
            height: "calc(100dvh - 120px)",
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
          },
        }}
        footer={null}
        maskClosable={false}
        onCancel={closeResults}
        modalRender={(node) => (
          <div data-oblique-coverage-ui="true">{node}</div>
        )}
      >
        {popupError && (
          <Alert
            type="warning"
            showIcon
            message={popupError}
            style={{ marginBottom: 8 }}
          />
        )}
        <div
          ref={attachDock}
          style={{ position: "relative", flex: 1, minHeight: 0, minWidth: 0 }}
        />
      </Modal>
      {createPortal(
        <StyleProvider container={styleContainer} cache={styleCache}>
          <ConfigProvider
            getPopupContainer={(trigger) =>
              trigger?.ownerDocument.body ?? host.ownerDocument.body
            }
          >
            <div
              data-oblique-coverage-ui="true"
              onKeyDown={(event) => {
                if (popup && event.key === "Escape") {
                  event.stopPropagation();
                  closeResults();
                }
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                minHeight: 0,
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              {popup && (
                <header
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    minWidth: 0,
                    padding: "8px 12px",
                  }}
                >
                  <strong
                    style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}
                  >
                    Objektansichten
                  </strong>
                  <Tooltip title="Im Hauptfenster anzeigen">
                    <Button
                      size="small"
                      aria-label="Im Hauptfenster anzeigen"
                      onClick={restoreDialog}
                      icon={<FontAwesomeIcon icon={faWindowRestore} />}
                    />
                  </Tooltip>
                  <Tooltip title="Objektansichten schließen">
                    <Button
                      size="small"
                      aria-label="Objektansichten schließen"
                      onClick={closeResults}
                      icon={<FontAwesomeIcon icon={faXmark} />}
                    />
                  </Tooltip>
                </header>
              )}
              <div
                style={{
                  position: "relative",
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                }}
              >
                {children}
              </div>
            </div>
          </ConfigProvider>
        </StyleProvider>,
        host
      )}
    </>
  );
};
