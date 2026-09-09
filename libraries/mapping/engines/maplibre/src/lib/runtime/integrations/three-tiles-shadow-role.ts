import type { Material, Mesh, Object3D } from "three";

type TileShadowRole = { receiver: boolean; caster: boolean };
const roles = new WeakMap<Object3D, TileShadowRole>();
const materialWrites = new WeakMap<
  Material,
  { colorWrite: boolean; depthWrite: boolean }
>();

export const getTileShadowRole = (root: Object3D): TileShadowRole | undefined =>
  roles.get(root);

/** Three's shadow pass uses its own depth material. Disabling colour/depth
 * writes on the display material hides a retained parent without hiding its
 * shadow. Restore before rebuilding appearance so opacity changes stay valid.
 */
export const setTileShadowMaterialReceiver = (
  material: Material,
  receiver: boolean
): void => {
  const saved = materialWrites.get(material);
  if (receiver) {
    if (!saved) return;
    material.colorWrite = saved.colorWrite;
    material.depthWrite = saved.depthWrite;
    materialWrites.delete(material);
  } else {
    if (!saved)
      materialWrites.set(material, {
        colorWrite: material.colorWrite,
        depthWrite: material.depthWrite,
      });
    material.colorWrite = false;
    material.depthWrite = false;
  }
};

/** Camera receivers and sun-corridor casters are separate roles. Publishing a
 * caster into the scene must not create another shadow-receiving colour pass.
 * Cache the role on the immutable payload so idle traversal does no mesh walk.
 */
export const setTileShadowRole = (
  root: Object3D,
  role: TileShadowRole
): void => {
  const previous = roles.get(root);
  if (
    previous?.receiver === role.receiver &&
    previous.caster === role.caster
  )
    return;
  roles.set(root, role);
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    roles.set(mesh, role);
    mesh.receiveShadow = role.receiver;
    mesh.castShadow = role.caster;
    // Existing shared shadow-scene contract: later material setup must not
    // reactivate partial child casters while their parent still owns depth.
    mesh.userData.disableShadowCasting = !role.caster;
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material])
      setTileShadowMaterialReceiver(material, role.receiver);
  });
};
