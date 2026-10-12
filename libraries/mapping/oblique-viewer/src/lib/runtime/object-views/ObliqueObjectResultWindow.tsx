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

const windowFillStyle = {
  width: "100%",
  height: "100%",
  margin: "0",
  padding: "0",
  border: "0",
  borderRadius: "0",
  boxSizing: "border-box",
} as const;
const mirroredStyleAttributes = [
  "rel",
  "href",
  "type",
  "media",
  "nonce",
  "title",
  "crossorigin",
  "integrity",
  "referrerpolicy",
  "disabled",
] as const;

/** AntD may reuse styles registered in the main document. Mirror their CSS, but
 * not cache ownership attributes: the popup StyleProvider owns only its nodes. */
const mirrorWindowStyles = (source: Document, target: Document) => {
  const copies = new Map<Element, HTMLStyleElement | HTMLLinkElement>();
  const start = target.createComment("oblique application styles");
  const end = target.createComment("end oblique application styles");
  target.head.append(start, end);
  let disposed = false;
  const sync = () => {
    if (disposed) return;
    const sources = [
      ...source.head.querySelectorAll<HTMLStyleElement | HTMLLinkElement>(
        'style, link[rel~="stylesheet"]'
      ),
    ];
    const current = new Set<Element>(sources);
    for (const [original, copy] of copies) {
      if (!current.has(original)) {
        copy.remove();
        copies.delete(original);
      }
    }
    let cursor: ChildNode | null = start.nextSibling;
    for (const original of sources) {
      let copy = copies.get(original);
      if (!copy) {
        copy = target.createElement(
          original.tagName === "STYLE" ? "style" : "link"
        );
        copy.dataset.obliqueStyleMirror = "true";
        copies.set(original, copy);
      }
      for (const attribute of mirroredStyleAttributes) {
        const value =
          attribute === "nonce"
            ? original.nonce || original.getAttribute(attribute)
            : original.getAttribute(attribute);
        if (value === null) {
          if (copy.hasAttribute(attribute)) copy.removeAttribute(attribute);
        } else if (copy.getAttribute(attribute) !== value)
          copy.setAttribute(attribute, value);
      }
      if (
        original.tagName === "STYLE" &&
        copy.textContent !== original.textContent
      )
        copy.textContent = original.textContent;
      if (copy.disabled !== original.disabled)
        copy.disabled = original.disabled;
      if (copy !== cursor) target.head.insertBefore(copy, cursor ?? end);
      cursor = copy.nextSibling;
    }
  };
  sync();
  // One head observer batches style registration/replacement without observing
  // the scene's DOM or touching independently generated popup styles.
  const observer = new MutationObserver(sync);
  observer.observe(source.head, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...mirroredStyleAttributes],
  });
  return () => {
    disposed = true;
    observer.disconnect();
    for (const copy of copies.values()) copy.remove();
    copies.clear();
    start.remove();
    end.remove();
  };
};

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
      ...windowFillStyle,
      position: "relative",
    });
    return element;
  });
  const mainDocument = useRef(host.ownerDocument).current;
  const dock = useRef<HTMLDivElement | null>(null);
  const owned = useRef<OwnedWindow | null>(null);
  const closing = useRef(false);
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

  const closeResults = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    restoreDialog();
    onClose();
  }, [onClose, restoreDialog]);

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
      "popup,width=1440,height=1000,resizable=yes"
    );
    if (!opened) {
      setPopupError(
        "Das externe Fenster wurde blockiert. Die Objektansichten bleiben hier geöffnet."
      );
      return;
    }
    let removeStyleMirror: (() => void) | undefined;
    try {
      const doc = opened.document;
      doc.title = "Objektansichten";
      const base = doc.createElement("base");
      base.href = mainDocument.baseURI;
      doc.head.appendChild(base);
      removeStyleMirror = mirrorWindowStyles(mainDocument, doc);
      Object.assign(doc.documentElement.style, windowFillStyle, {
        overflow: "hidden",
      });
      Object.assign(doc.body.style, {
        ...windowFillStyle,
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
          removeStyleMirror?.();
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
        removeStyleMirror?.();
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
            margin: 0,
            border: 0,
            borderRadius: 0,
            boxSizing: "border-box",
            backgroundColor: "#f2f2f2",
            overflow: "hidden",
          },
          body: {
            padding: 0,
            margin: 0,
            border: 0,
            borderRadius: 0,
            boxSizing: "border-box",
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
          style={{
            ...windowFillStyle,
            position: "relative",
            flex: 1,
            minHeight: 0,
            minWidth: 0,
          }}
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
                if (event.key === "Escape") {
                  event.stopPropagation();
                  closeResults();
                }
              }}
              style={{
                ...windowFillStyle,
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
                  ...windowFillStyle,
                  position: "relative",
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                }}
              >
                <div
                  className="oblique-object-window-actions"
                  role="toolbar"
                  aria-label="Objektansichten-Fensteraktionen"
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    zIndex: 20,
                    display: "flex",
                    gap: 4,
                  }}
                >
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
                </div>
                <ObjectWindowActions.Provider
                  value={
                    <Tooltip title="Objektansichten schließen">
                      <Button
                        size="small"
                        aria-label="Objektansichten schließen"
                        onClick={closeResults}
                        icon={<FontAwesomeIcon icon={faXmark} />}
                      />
                    </Tooltip>
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
