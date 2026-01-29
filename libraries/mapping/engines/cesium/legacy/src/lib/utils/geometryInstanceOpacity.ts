import {
  Color,
  ColorGeometryInstanceAttribute,
  Primitive,
} from "@carma/cesium";

export type GeometryInstanceRef = {
  primitive: Primitive;
  instanceId: unknown;
};

export const readGeometryInstanceOpacity = (
  instances: GeometryInstanceRef[]
): number | null => {
  for (const { primitive, instanceId } of instances) {
    if (!primitive.ready) continue;
    const attributes = primitive.getGeometryInstanceAttributes(instanceId);
    if (!attributes || !attributes.color) continue;
    return (attributes.color[3] ?? 255) / 255;
  }
  return null;
};

export const applyGeometryInstanceOpacity = (
  instances: GeometryInstanceRef[],
  opacity: number
): void => {
  const alpha = Math.min(1, Math.max(0, opacity));
  instances.forEach(({ primitive, instanceId }) => {
    if (!primitive.ready) return;
    const attributes = primitive.getGeometryInstanceAttributes(instanceId);
    if (!attributes || !attributes.color) return;
    const [r, g, b] = attributes.color;
    const color = Color.fromBytes(r, g, b, Math.round(alpha * 255));
    attributes.color = ColorGeometryInstanceAttribute.toValue(
      color,
      attributes.color
    );
  });
};
