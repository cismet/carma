import {
  createContext,
  useContext,
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
const ObjectWindowActions = createContext<ReactNode>(null);
export const useObliqueObjectWindowActions = () =>
  useContext(ObjectWindowActions);

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
        title={<span className="sr-only">Objektansichten</span>}
        closable={false}
        open={!popup}
        forceRender
        width="calc(100vw - 16px)"
        style={{ top: 8, paddingBottom: 0, maxWidth: "none" }}
        styles={{
          header: { height: 0, margin: 0, padding: 0 },
          content: {
            padding: 0,
            backgroundColor: "#f2f2f2",
            overflow: "hidden",
          },
          body: {
            display: "flex",
            flexDirection: "column",
            height: "calc(100dvh - 16px)",
            position: "relative",
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
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              right: 8,
              zIndex: 10,
            }}
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
              <div
                style={{
                  position: "relative",
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                }}
              >
                <ObjectWindowActions.Provider
                  value={
                    <>
                      <Tooltip
                        title={
                          popup
                            ? "Im Hauptfenster anzeigen"
                            : "In externem Fenster öffnen"
                        }
                      >
                        <Button
                          size="small"
                          aria-label={
                            popup
                              ? "Im Hauptfenster anzeigen"
                              : "In externem Fenster öffnen"
                          }
                          onClick={popup ? restoreDialog : openWindow}
                          icon={
                            <FontAwesomeIcon
                              icon={popup ? faWindowRestore : faExternalLink}
                            />
                          }
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
                    </>
                  }
                >
                  {children}
                </ObjectWindowActions.Provider>
              </div>
            </div>
          </ConfigProvider>
        </StyleProvider>,
        host
      )}
    </>
  );
};
