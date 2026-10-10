// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { Profiler, StrictMode, useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import Control from "./components/Control";
import ControlLayoutCanvas from "./components/ControlLayoutCanvas";
import { createControlRegistry } from "./control-registry";
import ControlLayout, { type Positions } from "./map-control";

const labelsIn = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-label]")).map((element) =>
    element.getAttribute("data-label")
  );

const Label = ({ name }: { name: string }) => <span data-label={name} />;

describe("ControlLayout", () => {
  it("sorts each position by order and keeps mount order for equal orders", () => {
    const { container } = render(
      <ControlLayout>
        <Control position="topleft" order={30}>
          <Label name="c" />
        </Control>
        <Control position="topleft" order={10}>
          <Label name="a" />
        </Control>
        <Control position="topleft" order={10}>
          <Label name="b" />
        </Control>
        <Control position="bottomright" order={1}>
          <Label name="z" />
        </Control>
        <ControlLayoutCanvas>
          <Label name="map" />
        </ControlLayoutCanvas>
      </ControlLayout>
    );

    expect(labelsIn(container)).toEqual(["map", "a", "b", "c", "z"]);
  });

  it("renders the controls itself when no canvas is mounted", () => {
    const { container } = render(
      <ControlLayout>
        <Control position="topright" order={1}>
          <Label name="only" />
        </Control>
      </ControlLayout>
    );

    expect(labelsIn(container)).toEqual(["only"]);
  });

  it("re-renders only the control whose content changed", () => {
    let setValue: (value: number) => void = () => undefined;
    const InfoBox = () => {
      const [value, setState] = useState(0);
      setValue = setState;
      return (
        <Control position="bottomright" order={12}>
          <span data-label={`info-${value}`} />
        </Control>
      );
    };
    const staticCommits = vi.fn();
    const staticContentRenders = vi.fn();
    const StaticContent = ({ name }: { name: string }) => {
      staticContentRenders(name);
      return <Label name={name} />;
    };
    const staticControls = (["a", "b", "c"] as const).map((name, index) => (
      <Profiler key={name} id={name} onRender={staticCommits}>
        <Control position="topleft" order={index}>
          <StaticContent name={name} />
        </Control>
      </Profiler>
    ));

    const { container } = render(
      <ControlLayout>
        {staticControls}
        <InfoBox />
        <ControlLayoutCanvas>
          <Label name="map" />
        </ControlLayoutCanvas>
      </ControlLayout>
    );
    staticCommits.mockClear();
    staticContentRenders.mockClear();

    for (let value = 1; value <= 5; value++) {
      act(() => setValue(value));
    }

    expect(labelsIn(container)).toEqual(["map", "a", "b", "c", "info-5"]);
    expect(staticCommits).not.toHaveBeenCalled();
    expect(staticContentRenders).not.toHaveBeenCalled();
  });

  it("moves a control when its position or order changes and drops it on unmount", () => {
    let setPlacement: (placement: {
      position: Positions;
      order: number;
      shown: boolean;
    }) => void = () => undefined;
    const Movable = () => {
      const [placement, setState] = useState({
        position: "topleft" as Positions,
        order: 0,
        shown: true,
      });
      setPlacement = setState;
      return placement.shown ? (
        <Control position={placement.position} order={placement.order}>
          <Label name="moving" />
        </Control>
      ) : null;
    };

    const { container } = render(
      <ControlLayout>
        <Control position="topleft" order={5}>
          <Label name="left" />
        </Control>
        <Control position="bottomright" order={5}>
          <Label name="right" />
        </Control>
        <Movable />
        <ControlLayoutCanvas>{null}</ControlLayoutCanvas>
      </ControlLayout>
    );
    expect(labelsIn(container)).toEqual(["moving", "left", "right"]);

    act(() => setPlacement({ position: "topleft", order: 10, shown: true }));
    expect(labelsIn(container)).toEqual(["left", "moving", "right"]);

    act(() =>
      setPlacement({ position: "bottomright", order: 10, shown: true })
    );
    expect(labelsIn(container)).toEqual(["left", "right", "moving"]);

    act(() =>
      setPlacement({ position: "bottomright", order: 10, shown: false })
    );
    expect(labelsIn(container)).toEqual(["left", "right"]);
  });

  it("commits a content update together with the other effect updates", () => {
    let setValue: (value: number) => void = () => undefined;
    const Echo = ({ value }: { value: number }) => {
      const [, setSeen] = useState(0);
      useEffect(() => setSeen(value), [value]);
      return null;
    };
    const InfoBox = () => {
      const [value, setState] = useState(0);
      setValue = setState;
      return (
        <>
          <Control position="bottomright" order={12}>
            <Label name={`info-${value}`} />
          </Control>
          <Echo value={value} />
        </>
      );
    };
    const commits = vi.fn();

    const { container } = render(
      <Profiler id="layout" onRender={commits}>
        <ControlLayout>
          <InfoBox />
          <ControlLayoutCanvas>
            <Label name="map" />
          </ControlLayoutCanvas>
        </ControlLayout>
      </Profiler>
    );
    commits.mockClear();

    act(() => setValue(1));

    expect(labelsIn(container)).toEqual(["map", "info-1"]);
    // One commit for the owner's render, one for the slot and Echo together.
    expect(commits).toHaveBeenCalledTimes(2);
  });

  it("keeps the content's DOM and local state across updates and neighbour changes", () => {
    let setValue: (value: number) => void = () => undefined;
    let setNeighbour: (shown: boolean) => void = () => undefined;
    const Layout = () => {
      const [value, setValueState] = useState(0);
      const [neighbour, setNeighbourState] = useState(false);
      setValue = setValueState;
      setNeighbour = setNeighbourState;
      return (
        <ControlLayout>
          {neighbour && (
            <Control position="topleft" order={1}>
              <Label name="neighbour" />
            </Control>
          )}
          <Control position="topleft" order={5}>
            <input data-label="field" title={`value ${value}`} />
          </Control>
          <ControlLayoutCanvas>
            <Label name="map" />
          </ControlLayoutCanvas>
        </ControlLayout>
      );
    };

    const { container } = render(
      <StrictMode>
        <Layout />
      </StrictMode>
    );
    const field = container.querySelector("input") as HTMLInputElement;
    field.value = "typed";
    field.focus();

    act(() => setValue(1));
    act(() => setNeighbour(true));
    act(() => setValue(2));

    expect(labelsIn(container)).toEqual(["map", "neighbour", "field"]);
    expect(container.querySelector("input")).toBe(field);
    expect(field.value).toBe("typed");
    expect(field.title).toBe("value 2");
    expect(document.activeElement).toBe(field);
  });
});

describe("createControlRegistry", () => {
  it("notifies only the changed control on a content update", () => {
    const registry = createControlRegistry();
    const first = registry.register("topleft", 1, "first");
    const second = registry.register("topleft", 2, "second");
    const slots = registry.getSlots();
    const onSlots = vi.fn();
    const onFirst = vi.fn();
    const onSecond = vi.fn();
    registry.subscribeSlots(onSlots);
    registry.subscribeContent(first, onFirst);
    registry.subscribeContent(second, onSecond);

    registry.update(first, "topleft", 1, "first, changed");

    expect(registry.getContent(first)).toBe("first, changed");
    expect(registry.getSlots()).toBe(slots);
    expect(onFirst).toHaveBeenCalledTimes(1);
    expect(onSecond).not.toHaveBeenCalled();
    expect(onSlots).not.toHaveBeenCalled();
  });

  it("publishes a new slot list for placement changes and removals only", () => {
    const registry = createControlRegistry();
    const id = registry.register("topleft", 1, "content");
    const onSlots = vi.fn();
    registry.subscribeSlots(onSlots);

    registry.update(id, "topleft", 1, "content");
    expect(onSlots).not.toHaveBeenCalled();

    registry.update(id, "bottomright", 3, "content");
    expect(registry.getSlots()).toEqual([
      { id, position: "bottomright", order: 3 },
    ]);

    registry.unregister(id);
    registry.unregister(id);
    expect(registry.getSlots()).toEqual([]);
    expect(registry.getContent(id)).toBeUndefined();
    expect(onSlots).toHaveBeenCalledTimes(2);
  });
});
