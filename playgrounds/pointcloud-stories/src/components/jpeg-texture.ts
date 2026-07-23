import * as THREE from "three/webgpu";

export type LoadedJpegTexture = {
  texture: THREE.Texture;
  bitmap: ImageBitmap;
  width: number;
  height: number;
  transferredBytes: number;
  gpuBytes: number;
};

const scaledDimensions = (
  width: number,
  height: number,
  maximumDimension: number
) => {
  const scale = Math.min(1, maximumDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

export const loadJpegTexture = async (
  url: string,
  sourceWidth: number,
  sourceHeight: number,
  maximumDimension = Number.POSITIVE_INFINITY
): Promise<LoadedJpegTexture> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  const blob = await response.blob();
  const dimensions = scaledDimensions(
    sourceWidth,
    sourceHeight,
    maximumDimension
  );
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: "flipY",
    resizeWidth: dimensions.width,
    resizeHeight: dimensions.height,
    resizeQuality: "high",
  });
  const texture = new THREE.Texture(bitmap);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return {
    texture,
    bitmap,
    ...dimensions,
    transferredBytes: blob.size,
    gpuBytes: dimensions.width * dimensions.height * 4,
  };
};

export const disposeJpegTexture = ({ texture, bitmap }: LoadedJpegTexture) => {
  texture.dispose();
  bitmap.close();
};
