import { describe, expect, it, vi } from "vitest";

import {
  getSharedThreeSceneRuntimes,
  notifySharedThreeSceneContentChanged,
  notifySharedThreeSceneRequestStateChanged,
  registerSharedThreeSceneRuntime,
  subscribeSharedThreeSceneContent,
  subscribeSharedThreeSceneRequestState,
} from "./shared-three-scene-content-registry";

describe("shared Three.js scene content registry", () => {
  it("notifies only subscribers of the affected map", () => {
    const firstMap = {} as never;
    const secondMap = {} as never;
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const unsubscribe = subscribeSharedThreeSceneContent(
      firstMap,
      firstListener
    );
    subscribeSharedThreeSceneContent(secondMap, secondListener);

    notifySharedThreeSceneContentChanged(firstMap);
    expect(firstListener).toHaveBeenCalledOnce();
    expect(secondListener).not.toHaveBeenCalled();

    unsubscribe();
    notifySharedThreeSceneContentChanged(firstMap);
    expect(firstListener).toHaveBeenCalledOnce();
  });

  it("keeps request-state notifications separate from content changes", () => {
    const map = {} as never;
    const contentListener = vi.fn();
    const requestListener = vi.fn();
    subscribeSharedThreeSceneContent(map, contentListener);
    const unsubscribe = subscribeSharedThreeSceneRequestState(
      map,
      requestListener
    );

    notifySharedThreeSceneRequestStateChanged(map);
    expect(requestListener).toHaveBeenCalledOnce();
    expect(contentListener).not.toHaveBeenCalled();

    unsubscribe();
    notifySharedThreeSceneRequestStateChanged(map);
    expect(requestListener).toHaveBeenCalledOnce();
  });

  it("registers runtimes for shadow-mode styling and unregisters them", () => {
    const map = {} as never;
    const runtime = { id: "lod2" } as never;

    const unregister = registerSharedThreeSceneRuntime(map, runtime);
    expect(getSharedThreeSceneRuntimes(map)).toEqual([runtime]);

    unregister();
    expect(getSharedThreeSceneRuntimes(map)).toEqual([]);
  });
});
