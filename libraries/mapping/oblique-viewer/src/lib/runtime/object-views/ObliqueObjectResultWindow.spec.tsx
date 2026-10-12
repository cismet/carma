import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ObliqueObjectResultWindow,
  useObliqueObjectWindowActions,
} from "./ObliqueObjectResultWindow";

vi.mock("@ant-design/cssinjs", () => ({
  createCache: () => ({}),
  StyleProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@fortawesome/react-fontawesome", () => ({
  FontAwesomeIcon: () => <span aria-hidden="true" />,
}));
vi.mock("antd", () => ({
  ConfigProvider: ({ children }: { children: ReactNode }) => children,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  Button: ({
    icon,
    onClick,
    "aria-label": label,
  }: {
    icon: ReactNode;
    onClick: () => void;
    "aria-label": string;
  }) => (
    <button aria-label={label} onClick={onClick}>
      {icon}
    </button>
  ),
  Alert: ({ message }: { message: ReactNode }) => (
    <div role="alert">{message}</div>
  ),
  // Keep the dock mounted while closed, as Modal forceRender does. The real
  // portal and document adoption below remain unmocked.
  Modal: ({
    children,
    open,
    styles,
    onCancel,
    modalRender,
  }: {
    children: ReactNode;
    open: boolean;
    styles: { content: CSSProperties; body: CSSProperties };
    onCancel: () => void;
    modalRender: (node: ReactNode) => ReactNode;
  }) =>
    modalRender(
      <div
        role="dialog"
        hidden={!open}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <div data-testid="modal-content" style={styles.content}>
          <div data-testid="modal-body" style={styles.body}>
            {children}
          </div>
        </div>
      </div>
    ),
}));

const popupFrames: HTMLIFrameElement[] = [];
const sourceStyles: Element[] = [];
const addSourceStyle = (css: string, hash?: string) => {
  const style = document.createElement("style");
  style.textContent = css;
  if (hash) {
    style.dataset.cssHash = hash;
    style.dataset.tokenHash = "source-theme-token";
  }
  document.head.appendChild(style);
  sourceStyles.push(style);
  return style;
};
const popupWindow = () => {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  popupFrames.push(frame);
  const popup = frame.contentWindow!;
  Object.defineProperty(popup, "closed", { configurable: true, value: false });
  const close = vi.spyOn(popup, "close").mockImplementation(() => {
    Object.defineProperty(popup, "closed", { configurable: true, value: true });
  });
  const focus = vi.spyOn(popup, "focus").mockImplementation(() => {});
  const open = vi.spyOn(window, "open").mockReturnValue(popup);
  return { popup, close, focus, open };
};

const mountResults = () => {
  const mounted = vi.fn(),
    disposed = vi.fn(),
    onClose = vi.fn();
  const Content = () => {
    const actions = useObliqueObjectWindowActions();
    const [count, setCount] = useState(0);
    useEffect(() => {
      mounted();
      return disposed;
    }, []);
    return (
      <>
        <div role="group" aria-label="Zentrale Aktionen">
          {actions}
        </div>
        <button aria-pressed={count > 0} onClick={() => setCount(count + 1)}>
          Bildinhalt {count}
        </button>
      </>
    );
  };
  const view = render(
    <ObliqueObjectResultWindow onClose={onClose}>
      <Content />
    </ObliqueObjectResultWindow>
  );
  return { ...view, mounted, disposed, onClose };
};
const toolbar = (body: HTMLElement = document.body) =>
  within(body).getByRole("toolbar", {
    name: "Objektansichten-Fensteraktionen",
  });
const central = (body: HTMLElement = document.body) =>
  within(body).getByRole("group", {
    name: "Zentrale Aktionen",
  });
const openPopup = () =>
  fireEvent.click(
    within(toolbar()).getByRole("button", {
      name: "In externem Fenster öffnen",
    })
  );

afterEach(() => {
  cleanup();
  for (const frame of popupFrames.splice(0)) frame.remove();
  for (const style of sourceStyles.splice(0)) style.remove();
  vi.restoreAllMocks();
});

describe("object result window actions", () => {
  it("keeps rectangular content with window actions in the upper right and only close in the central context", () => {
    const view = mountResults();
    const actions = toolbar();
    expect(actions.className).toBe("oblique-object-window-actions");
    expect(actions.style.position).toBe("absolute");
    expect(actions.style.top).toBe("8px");
    expect(actions.style.right).toBe("8px");
    expect(actions.closest("[data-oblique-object-window]")).not.toBeNull();
    expect(within(actions).getAllByRole("button")).toHaveLength(2);
    expect(within(central()).getAllByRole("button")).toHaveLength(1);
    expect(
      within(central()).getByRole("button", {
        name: "Objektansichten schließen",
      })
    ).toBeTruthy();
    expect(screen.getByTestId("modal-content").style.borderRadius).toBe("0");
    expect(screen.getByTestId("modal-body").style.borderRadius).toBe("0");
    fireEvent.click(
      within(actions).getByRole("button", { name: "Objektansichten schließen" })
    );
    fireEvent.click(
      within(central()).getByRole("button", {
        name: "Objektansichten schließen",
      })
    );
    expect(view.onClose).toHaveBeenCalledOnce();
  });

  it("keeps the result tree in place and reports blocked native popups", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const view = mountResults();
    const content = screen.getByRole("button", { name: "Bildinhalt 0" });
    openPopup();
    expect(screen.getByRole("alert").textContent).toContain("wurde blockiert");
    expect(screen.getByRole("button", { name: "Bildinhalt 0" })).toBe(content);
    expect(view.mounted).toHaveBeenCalledOnce();
    expect(view.disposed).not.toHaveBeenCalled();
    expect(view.onClose).not.toHaveBeenCalled();
  });

  it("moves and restores the same live portal tree including its corner toolbar", () => {
    const native = popupWindow();
    const view = mountResults();
    const content = screen.getByRole("button", { name: "Bildinhalt 0" });
    const originalToolbar = toolbar();
    fireEvent.click(content);
    openPopup();
    expect(native.open).toHaveBeenCalledWith(
      "",
      "_blank",
      "popup,width=1440,height=1000,resizable=yes"
    );
    expect(native.focus).toHaveBeenCalledOnce();
    const host = content.closest<HTMLElement>("[data-oblique-object-window]")!;
    for (const element of [
      native.popup.document.documentElement,
      native.popup.document.body,
      host,
      host.firstElementChild as HTMLElement,
    ]) {
      expect(element.style.width).toBe("100%");
      expect(element.style.height).toBe("100%");
      expect(element.style.boxSizing).toBe("border-box");
      expect(parseFloat(element.style.padding)).toBe(0);
      expect(parseFloat(element.style.margin)).toBe(0);
      expect(parseFloat(element.style.borderWidth)).toBe(0);
      expect(parseFloat(element.style.borderRadius)).toBe(0);
    }
    act(() => native.popup.dispatchEvent(new Event("resize")));
    expect(toolbar(native.popup.document.body)).toBe(originalToolbar);
    expect(
      within(native.popup.document.body).getByRole("button", {
        name: "Bildinhalt 1",
      })
    ).toBe(content);
    expect(
      within(central(native.popup.document.body)).getAllByRole("button")
    ).toHaveLength(1);
    fireEvent.click(
      within(toolbar(native.popup.document.body)).getByRole("button", {
        name: "Im Hauptfenster anzeigen",
      })
    );
    expect(screen.getByRole("button", { name: "Bildinhalt 1" })).toBe(content);
    expect(toolbar()).toBe(originalToolbar);
    expect(native.close).toHaveBeenCalledOnce();
    expect(view.mounted).toHaveBeenCalledOnce();
    expect(view.disposed).not.toHaveBeenCalled();
    expect(view.onClose).not.toHaveBeenCalled();
  });

  it("mirrors cached AntD CSS and stylesheet changes without claiming their cache attributes or copying scripts", async () => {
    const rules =
      ".oblique-object-window-actions { width:52px; height:24px; } [aria-pressed=true] { background-color:rgb(0,85,255); }";
    const cached = addSourceStyle(rules, "button-rules");
    cached.setAttribute("nonce", "style-nonce");
    cached.setAttribute("onload", "notCopied()");
    const font = document.createElement("link");
    font.rel = "stylesheet";
    font.setAttribute("href", "./object-font.css");
    font.setAttribute("crossorigin", "anonymous");
    font.media = "screen";
    document.head.appendChild(font);
    sourceStyles.push(font);
    const script = document.createElement("script");
    script.type = "application/json";
    script.textContent = '{"unrelated":true}';
    document.head.appendChild(script);
    sourceStyles.push(script);
    const native = popupWindow();
    const view = mountResults();
    const content = screen.getByRole("button", { name: "Bildinhalt 0" });
    fireEvent.click(content);
    openPopup();
    const head = native.popup.document.head;
    const mirrored = [
      ...head.querySelectorAll<HTMLStyleElement>(
        "style[data-oblique-style-mirror]"
      ),
    ].find((style) => style.textContent === rules)!;
    expect(mirrored).toBeTruthy();
    expect(mirrored.hasAttribute("data-css-hash")).toBe(false);
    expect(mirrored.hasAttribute("data-token-hash")).toBe(false);
    expect(mirrored.hasAttribute("onload")).toBe(false);
    expect(mirrored.nonce).toBe("style-nonce");
    expect(head.querySelector("script")).toBeNull();
    const mirroredFont = head.querySelector<HTMLLinkElement>(
      "link[data-oblique-style-mirror]"
    )!;
    expect(mirroredFont.getAttribute("href")).toBe("./object-font.css");
    expect(mirroredFont.getAttribute("crossorigin")).toBe("anonymous");
    expect(mirroredFont.media).toBe("screen");
    expect(
      native.popup.getComputedStyle(toolbar(native.popup.document.body)).width
    ).toBe("52px");
    expect(native.popup.getComputedStyle(content).backgroundColor).toBe(
      "rgb(0, 85, 255)"
    );
    let late: HTMLStyleElement;
    await act(async () => {
      cached.textContent = rules.replace("52px", "60px");
      font.media = "print";
      late = addSourceStyle(
        ".late-component { color:rgb(255,0,0); }",
        "late-rules"
      );
    });
    expect(mirrored.textContent).toContain("width:60px");
    expect(mirroredFont.media).toBe("print");
    expect(
      [...head.querySelectorAll("style[data-oblique-style-mirror]")].some(
        (style) => style.textContent === late!.textContent
      )
    ).toBe(true);
    await act(async () => {
      cached.remove();
      font.remove();
    });
    expect(mirrored.isConnected).toBe(false);
    expect(mirroredFont.isConnected).toBe(false);
    expect(view.mounted).toHaveBeenCalledOnce();
    expect(view.disposed).not.toHaveBeenCalled();
  });

  it.each(["restore", "native-close", "unmount"] as const)(
    "disconnects mirrored styles on %s while retaining popup-owned style nodes",
    async (exit) => {
      addSourceStyle(".application { color:blue; }", "cached");
      const native = popupWindow();
      const view = mountResults();
      openPopup();
      const ownStyle = native.popup.document.createElement("style");
      ownStyle.dataset.cssHash = "popup-provider-owned";
      ownStyle.textContent = ".popup-generated { color:red; }";
      native.popup.document.head.appendChild(ownStyle);
      if (exit === "unmount") view.unmount();
      else if (exit === "native-close") {
        Object.defineProperty(native.popup, "closed", {
          configurable: true,
          value: true,
        });
        act(() => native.popup.dispatchEvent(new Event("pagehide")));
      } else
        fireEvent.click(
          within(toolbar(native.popup.document.body)).getByRole("button", {
            name: "Im Hauptfenster anzeigen",
          })
        );
      await act(async () => {
        addSourceStyle(".after-exit { color:green; }");
      });
      expect(
        native.popup.document.head.querySelectorAll(
          "[data-oblique-style-mirror]"
        )
      ).toHaveLength(0);
      expect(ownStyle.parentElement).toBe(native.popup.document.head);
      expect(ownStyle.textContent).toBe(".popup-generated { color:red; }");
      expect(view.onClose).not.toHaveBeenCalled();
    }
  );

  it("restores on native window close without closing or remounting the results", () => {
    const native = popupWindow();
    const view = mountResults();
    const content = screen.getByRole("button", { name: "Bildinhalt 0" });
    openPopup();
    Object.defineProperty(native.popup, "closed", {
      configurable: true,
      value: true,
    });
    act(() => native.popup.dispatchEvent(new Event("pagehide")));
    expect(screen.getByRole("button", { name: "Bildinhalt 0" })).toBe(content);
    expect(native.close).not.toHaveBeenCalled();
    expect(view.onClose).not.toHaveBeenCalled();
    expect(view.mounted).toHaveBeenCalledOnce();
    expect(view.disposed).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "closes exactly once with Escape in the popup=%s host",
    (external) => {
      const native = external ? popupWindow() : null;
      const view = mountResults();
      const content = screen.getByRole("button", { name: "Bildinhalt 0" });
      if (external) openPopup();
      fireEvent.keyDown(content, { key: "Escape" });
      fireEvent.keyDown(content, { key: "Escape" });
      expect(view.onClose).toHaveBeenCalledOnce();
      if (native) expect(native.close).toHaveBeenCalledOnce();
    }
  );

  it("releases its owned popup and result tree once on unmount", () => {
    const native = popupWindow();
    const view = mountResults();
    openPopup();
    view.unmount();
    expect(native.close).toHaveBeenCalledOnce();
    expect(view.disposed).toHaveBeenCalledOnce();
    act(() => native.popup.dispatchEvent(new Event("pagehide")));
    expect(native.close).toHaveBeenCalledOnce();
    expect(view.onClose).not.toHaveBeenCalled();
  });
});
