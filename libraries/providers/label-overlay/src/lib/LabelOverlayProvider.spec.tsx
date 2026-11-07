import { useEffect } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LABEL_OVERLAY_CONTAINER_SELECTOR } from "./constants";
import type { LabelOverlayHostBinding } from "./host";
import { LabelOverlayProvider } from "./LabelOverlayProvider";
import { useLabelOverlay } from "./useLabelOverlay";

const LABEL_ID = "label-1";

const Label = () => {
  const { setLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();
  useEffect(() => {
    setLabelOverlayElement({
      id: LABEL_ID,
      content: <span>label</span>,
      updatePosition: () => true,
    });
    return () => removeLabelOverlayElement(LABEL_ID);
  }, [setLabelOverlayElement, removeLabelOverlayElement]);
  return null;
};

const createRoot = () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return root;
};

/** A host whose root is resolved live, like the Cesium host's; `runFrame` is its frame tick. */
const createHost = () => {
  let root: HTMLElement | null = null;
  let frame: (() => void) | undefined;
  const host: LabelOverlayHostBinding = {
    containerRef: {
      get current() {
        return root;
      },
    },
    subscribeFrame: (updateFn) => {
      frame = updateFn;
      return () => {
        frame = undefined;
      };
    },
  };
  return {
    host,
    setRoot: (next: HTMLElement | null) => {
      root = next;
    },
    runFrame: () => frame?.(),
  };
};

const nextFrame = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      })
  );

const labelIn = (root: HTMLElement) =>
  root.querySelector(
    `${LABEL_OVERLAY_CONTAINER_SELECTOR} [data-label-overlay-id="${LABEL_ID}"]`
  );

describe("LabelOverlayProvider host root", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts the overlay and its labels in the host root", async () => {
    const { host, setRoot } = createHost();
    const root = createRoot();
    setRoot(root);

    render(
      <LabelOverlayProvider host={host}>
        <Label />
      </LabelOverlayProvider>
    );
    await nextFrame();

    expect(labelIn(root)).not.toBeNull();
  });

  it("moves the overlay and its labels to the root that replaced a detached one", async () => {
    const { host, setRoot, runFrame } = createHost();
    const firstRoot = createRoot();
    setRoot(firstRoot);

    render(
      <LabelOverlayProvider host={host}>
        <Label />
      </LabelOverlayProvider>
    );
    await nextFrame();
    expect(labelIn(firstRoot)).not.toBeNull();

    firstRoot.remove();
    const secondRoot = createRoot();
    setRoot(secondRoot);
    act(() => runFrame());
    await nextFrame();

    expect(labelIn(secondRoot)).not.toBeNull();
    expect(labelIn(firstRoot)).toBeNull();
  });

  it("waits for the host to resolve a new root after the old one detached", async () => {
    const { host, setRoot, runFrame } = createHost();
    const firstRoot = createRoot();
    setRoot(firstRoot);

    render(
      <LabelOverlayProvider host={host}>
        <Label />
      </LabelOverlayProvider>
    );
    await nextFrame();

    firstRoot.remove();
    setRoot(null);
    act(() => runFrame());
    await nextFrame();
    expect(document.querySelector(LABEL_OVERLAY_CONTAINER_SELECTOR)).toBeNull();

    const secondRoot = createRoot();
    setRoot(secondRoot);
    await nextFrame();
    await nextFrame();

    expect(labelIn(secondRoot)).not.toBeNull();
  });
});
