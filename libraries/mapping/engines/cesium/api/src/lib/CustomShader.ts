import { CustomShader } from "cesium";
export { CustomShader };

export const isValidCustomShader = (
  shader: unknown
): shader is CustomShader => {
  return shader instanceof CustomShader;
};
