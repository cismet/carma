import type { Camera, Mesh, Object3D, Scene, WebGLRenderer } from "three";

const members = new WeakMap<Object3D, ReadonlySet<Object3D>>();

/** Restrict colour/depth RECEIVERS without excluding any shadow caster.
 * The light's camera is distinct from the receiver capture camera.
 * Geometry and materials remain shared and unmodified in both passes.
 * Payload subtrees are immutable; replacement payloads have a new object ID.
 */
export const renderShadowReceiverObject = (
  scene: Scene,
  objectId: number | undefined,
  renderer: WebGLRenderer,
  camera: Camera,
  pass: "shadow-and-color" | "color-only" = "shadow-and-color"
): boolean => {
  const render = () => renderer.render(scene, camera);
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
  // Decision: suppress the draw, not its framebuffer writes. The latter still
  // runs every unrelated vertex/shader for each sun sample. The public draw
  // entry distinguishes capture from light cameras without hiding any caster.
  // See three/CORRIDOR_PERFORMANCE_20260909.md, RECEIVER-DRAW-ELISION-20260910.
  const drawBuffer = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function (...args) {
    const [drawCamera, , , , object] = args;
    if (
      drawCamera === camera &&
      (object as Mesh).isMesh &&
      !receiver.has(object)
    )
      return;
    drawBuffer.apply(this, args);
  };
  try {
    render();
    return true;
  } finally {
    renderer.renderBufferDirect = drawBuffer;
  }
};
