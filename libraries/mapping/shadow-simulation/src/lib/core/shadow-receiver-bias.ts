import { clamp } from "@carma-commons/math";

/** Physical receiver offsets for PCF. A host-supplied world-grid footprint
 * keeps terrain contacts independent of the observing camera and DPR. */
export const resolveShadowReceiverBias = (
  input: Readonly<{
    metersPerTexel: number;
    receiverTexelMeters?: number;
    elevationSine: number;
    depthRangeMeters: number;
    receiverBiasMeters?: number;
    maxReceiverBiasMeters?: number;
  }>
) => {
  const footprint =
    input.receiverTexelMeters !== undefined &&
    Number.isFinite(input.receiverTexelMeters) &&
    input.receiverTexelMeters > 0
      ? input.receiverTexelMeters
      : input.metersPerTexel;
  // Reconstruction precision is not a PCF self-intersection bound: low sun
  // and neighbouring triangles require a footprint-sized physical offset.
  const normalBias = clamp(
    (footprint * 1.2) / Math.max(0.2, input.elevationSine),
    0.05,
    8
  );
  const depthRange = Math.max(input.depthRangeMeters, 1);
  const depthBias = -clamp((footprint * 4) / depthRange, Number.EPSILON, 0.01);
  const limit =
    input.maxReceiverBiasMeters !== undefined &&
    Number.isFinite(input.maxReceiverBiasMeters)
      ? Math.max(0, input.maxReceiverBiasMeters)
      : Infinity;
  const fixed =
    input.receiverBiasMeters !== undefined &&
    Number.isFinite(input.receiverBiasMeters)
      ? Math.max(0, input.receiverBiasMeters)
      : undefined;
  return {
    bias: Math.max(
      fixed === undefined ? depthBias : -fixed / depthRange,
      -limit / depthRange
    ),
    normalBias: Math.min(fixed ?? normalBias, limit),
  };
};
