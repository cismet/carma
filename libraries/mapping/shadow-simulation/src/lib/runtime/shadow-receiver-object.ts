import type { Material, Mesh, Object3D, Scene } from "three";

const members = new WeakMap<Object3D, ReadonlySet<Object3D>>();

/** Restrict colour/depth RECEIVERS without excluding any shadow caster.
 * Three calls onBeforeShadow for its sun pass, onBeforeRender for colour.
 * Per-draw writes also support materials shared between different objects.
 * Payload subtrees are immutable; replacement payloads have a new object ID.
 */
export const renderShadowReceiverObject = (
  scene: Scene,
  objectId: number | undefined,
  render: () => void,
  pass: "shadow-and-color" | "color-only" = "shadow-and-color"
): boolean => {
  if (objectId === undefined) {
    render();
    return true;
  }
  const root = scene.getObjectById(objectId);
  if (!root) return false;
  let receiver = members.get(root);
  if (!receiver) {
    const objects = new Set<Object3D>();
    root.traverse((object) => objects.add(object));
    members.set(root, objects);
    receiver = objects;
  }
  if (pass === "color-only") {
    // Only for replay with shadowMap updates disabled. Hide unrelated draws,
    // not groups/lights or receiver ancestors. Restore before any depth pass.
    const ancestors = new Set<Object3D>();
    for (let parent = root.parent; parent; parent = parent.parent)
      ancestors.add(parent);
    const hidden: Object3D[] = [];
    scene.traverse((object) => {
      if (
        (object as Mesh).isMesh &&
        object.visible &&
        !receiver.has(object) &&
        !ancestors.has(object)
      ) {
        hidden.push(object);
        object.visible = false;
      }
    });
    try {
      render();
      return true;
    } finally {
      for (const object of hidden) object.visible = true;
    }
  }
  const restoreCallbacks: (() => void)[] = [];
  const writes = new Map<
    Material,
    { colorWrite: boolean; depthWrite: boolean }
  >();
  const restore = (material: Material) => {
    const saved = writes.get(material);
    if (!saved) return;
    material.colorWrite = saved.colorWrite;
    material.depthWrite = saved.depthWrite;
    writes.delete(material);
  };
  scene.traverseVisible((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || receiver.has(mesh)) return;
    const before = mesh.onBeforeRender;
    const after = mesh.onAfterRender;
    mesh.onBeforeRender = (...args) => {
      before.call(mesh, ...args);
      const material = args[4];
      writes.set(material, {
        colorWrite: material.colorWrite,
        depthWrite: material.depthWrite,
      });
      material.colorWrite = false;
      material.depthWrite = false;
    };
    mesh.onAfterRender = (...args) => {
      restore(args[4]);
      after.call(mesh, ...args);
    };
    restoreCallbacks.push(() => {
      mesh.onBeforeRender = before;
      mesh.onAfterRender = after;
    });
  });
  try {
    render();
    return true;
  } finally {
    for (const material of writes.keys()) restore(material);
    for (const restoreCallbacksForMesh of restoreCallbacks)
      restoreCallbacksForMesh();
  }
};
