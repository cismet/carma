// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";

import { nextAutoplayScene, useAutoplay } from "./useAutoplay";

const scenes = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("nextAutoplayScene", () => {
  it("goes to the next scene of the story", () => {
    expect(nextAutoplayScene(scenes, "a")?.id).toBe("b");
  });

  it("goes from the last scene back to the first", () => {
    expect(nextAutoplayScene(scenes, "c")?.id).toBe("a");
  });

  it("starts with the first scene when none of the story is on the display", () => {
    expect(nextAutoplayScene(scenes, null)?.id).toBe("a");
    expect(nextAutoplayScene(scenes, "elsewhere")?.id).toBe("a");
  });

  it("has nothing to go to in an empty story", () => {
    expect(nextAutoplayScene([], "a")).toBeUndefined();
  });
});

describe("useAutoplay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const render = (
    options: Partial<Parameters<typeof useAutoplay<{ id: string }>>[0]>
  ) => {
    const goToScene = vi.fn();
    const onStop = vi.fn();
    const props = {
      scenes: scenes as readonly { id: string }[] | undefined,
      activeSceneId: "a" as string | null,
      isHolding: false,
      seconds: 10,
      goToScene,
      onStop,
      ...options,
    };
    const hook = renderHook((current: typeof props) => useAutoplay(current), {
      initialProps: props,
    });
    return { ...hook, props, goToScene, onStop };
  };

  it("goes on after the scene's time", () => {
    const { goToScene } = render({});
    vi.advanceTimersByTime(9_999);
    expect(goToScene).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(goToScene).toHaveBeenCalledWith({ id: "b" });
  });

  it("waits while it is held and gives the scene its full time after", () => {
    const { goToScene, rerender, props } = render({ isHolding: true });
    vi.advanceTimersByTime(30_000);
    expect(goToScene).not.toHaveBeenCalled();
    rerender({ ...props, isHolding: false });
    vi.advanceTimersByTime(9_999);
    expect(goToScene).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(goToScene).toHaveBeenCalledTimes(1);
  });

  it("does not start over when only the callbacks change", () => {
    const { goToScene, rerender, props } = render({});
    vi.advanceTimersByTime(6_000);
    rerender({ ...props, goToScene, onStop: vi.fn() });
    vi.advanceTimersByTime(4_000);
    expect(goToScene).toHaveBeenCalledWith({ id: "b" });
  });

  it("stops when a scene of another story is picked", () => {
    const { goToScene, onStop } = render({ activeSceneId: "elsewhere" });
    expect(onStop).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    expect(goToScene).not.toHaveBeenCalled();
  });

  it("does nothing while no story plays", () => {
    const { goToScene } = render({ scenes: undefined });
    vi.advanceTimersByTime(30_000);
    expect(goToScene).not.toHaveBeenCalled();
  });
});
