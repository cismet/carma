// @vitest-environment jsdom
import {
  Group,
  Mesh,
  BufferGeometry,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  type WebGLRenderer,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { createTileDrawObserver } from "./three-tiles-draw-observer";
import type { RuntimeTile } from "./three-tiles-runtime-types";

describe("tile WebGL draw acknowledgement", () => {
  it("distinguishes residency, mount and submitted primary draws without assuming pixel visibility", () => {
    const group = new Group(),
      scene = new Scene(),
      model = new Group(),
      mesh = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
    const primary = new PerspectiveCamera(),
      secondary = new PerspectiveCamera();
    model.add(mesh);
    group.add(model);
    const tile = {
      internal: { loadingState: 4 },
      engineData: { scene: model },
    } as RuntimeTile;
    const contextLost = vi.fn(() => false);
    const renderer = {
      domElement: document.createElement("canvas"),
      info: { render: { calls: 0 } },
      getContext: () => ({ isContextLost: contextLost }),
    } as unknown as WebGLRenderer;
    const notify = vi.fn(),
      shadowNotify = vi.fn(),
      observer = createTileDrawObserver(notify, shadowNotify);
    const before = mesh.onBeforeRender,
      after = mesh.onAfterRender;
    const beforeShadow = mesh.onBeforeShadow,
      afterShadow = mesh.onAfterShadow;
    observer.attach(tile, model);
    observer.beginFrame(primary);
    const read = () => observer.read([tile], group);
    const draw = (camera: PerspectiveCamera, submitted = true) => {
      mesh.onBeforeRender(
        renderer,
        scene,
        camera,
        mesh.geometry,
        mesh.material,
        group
      );
      if (submitted) renderer.info.render.calls++;
      mesh.onAfterRender(
        renderer,
        scene,
        camera,
        mesh.geometry,
        mesh.material,
        group
      );
    };
    const shadow = (submitted = true) => {
      mesh.onBeforeShadow(
        renderer,
        mesh,
        primary,
        secondary,
        mesh.geometry,
        mesh.material,
        null
      );
      if (submitted) renderer.info.render.calls++;
      mesh.onAfterShadow(
        renderer,
        mesh,
        primary,
        secondary,
        mesh.geometry,
        mesh.material,
        null
      );
    };
    shadow(false);
    expect(shadowNotify).not.toHaveBeenCalled();
    shadow();
    shadow();
    expect(shadowNotify).toHaveBeenCalledOnce();
    expect(shadowNotify).toHaveBeenCalledWith(tile);
    expect(notify).not.toHaveBeenCalled();
    expect(read()).toMatchObject({
      published: 1,
      loaded: 1,
      mounted: 1,
      submittedInAnyView: 0,
    });
    draw(primary, false);
    expect(read().submittedInMainView).toBe(0);
    draw(secondary);
    expect(read()).toMatchObject({
      submittedInAnyView: 1,
      submittedInMainView: 0,
    });
    expect(notify).not.toHaveBeenCalled();
    draw(primary);
    draw(primary);
    expect(read()).toMatchObject({
      submittedInMainView: 1,
      submittedThisMainFrame: 1,
    });
    expect(notify).toHaveBeenCalledOnce();
    observer.beginFrame(primary);
    expect(read().submittedThisMainFrame).toBe(0);
    renderer.domElement.dispatchEvent(new Event("webglcontextlost"));
    expect(read().submittedInMainView).toBe(0);
    renderer.domElement.dispatchEvent(new Event("webglcontextrestored"));
    expect(read().submittedInMainView).toBe(0);
    draw(primary);
    expect(read().submittedInMainView).toBe(1);
    group.remove(model);
    expect(read()).toMatchObject({
      loaded: 1,
      mounted: 0,
      submittedInMainView: 0,
    });
    observer.detach(model);
    expect(mesh.onBeforeRender).toBe(before);
    expect(mesh.onAfterRender).toBe(after);
    expect(mesh.onBeforeShadow).toBe(beforeShadow);
    expect(mesh.onAfterShadow).toBe(afterShadow);
    observer.dispose();
  });
});
