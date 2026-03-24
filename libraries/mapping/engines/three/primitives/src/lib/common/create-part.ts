import { Object3D } from "three";

export type ThreePartSize = {
  widthPx: number;
  heightPx: number;
};

export type ThreePart<UpdateInput, DisplayInput> = {
  update: (input: UpdateInput) => void;
  setDisplay: (display: DisplayInput) => void;
  resize: (size: ThreePartSize) => void;
  dispose: () => void;
};

type Disposable = {
  dispose: () => void;
};

type CreateThreePartOptions<UpdateInput, DisplayInput> = {
  update?: (input: UpdateInput) => void;
  setDisplay?: (display: DisplayInput) => void;
  resize?: (size: ThreePartSize) => void;
  dispose?: () => void;
};

const NOOP = () => {};

export const createThreePart = <UpdateInput, DisplayInput>({
  update,
  setDisplay,
  resize,
  dispose,
}: CreateThreePartOptions<UpdateInput, DisplayInput>): ThreePart<
  UpdateInput,
  DisplayInput
> => ({
  update: update ?? NOOP,
  setDisplay: setDisplay ?? NOOP,
  resize: resize ?? NOOP,
  dispose: dispose ?? NOOP,
});

export const removeThreePartObjects = (objects: Object3D[]): void => {
  objects.forEach((object) => object.removeFromParent());
};

export const disposeThreePartResources = (resources: Disposable[]): void => {
  resources.forEach((resource) => resource.dispose());
};
