import type { Matrix4 } from "three";

import type {
  AnnotationEngine,
  AnnotationScenePrimitiveHandle,
} from "@carma-mapping/annotations/core";

/**
 * A ring, disc or cone placed by a model matrix: the render model of a solid
 * scene part, the counterpart of `EdgeSceneLine` for lines.
 */
export type ScenePrimitiveModel = {
  id: string;
  /** Equal signatures keep the engine primitive when the models are rebuilt. */
  signature: string;
  /** Creates the engine primitive at its first placement; null when the engine has none. */
  create: (
    engine: AnnotationEngine,
    modelMatrix: Matrix4
  ) => AnnotationScenePrimitiveHandle | null;
  /** The model matrix for this frame; null hides the primitive. */
  place: () => Matrix4 | null;
};
