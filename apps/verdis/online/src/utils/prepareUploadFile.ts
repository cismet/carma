// The upload endpoint's nginx rejects request bodies over 1 MiB (413 without
// CORS headers, so Safari only reports "TypeError: Load failed"). Keep some
// headroom for the multipart envelope and task params.
export const MAX_UPLOAD_BYTES = 1000 * 1000;

const RESIZABLE_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

const MAX_DIMENSIONS = [2400, 1800, 1400, 1000];
const JPEG_QUALITIES = [0.85, 0.7, 0.55];

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image could not be decoded"));
    };
    img.src = url;
  });

const toJpegBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });

const toJpegName = (name: string) => name.replace(/\.[^.]+$/, "") + ".jpg";

export const prepareUploadFile = async (
  file: File
): Promise<{ blob: Blob; name: string }> => {
  if (
    file.size <= MAX_UPLOAD_BYTES ||
    !RESIZABLE_IMAGE_TYPES.includes(file.type)
  ) {
    return { blob: file, name: file.name };
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return { blob: file, name: file.name };
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { blob: file, name: file.name };
  }

  for (const maxDim of MAX_DIMENSIONS) {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    // white background so transparent PNGs don't turn black as JPEG
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    for (const quality of JPEG_QUALITIES) {
      const blob = await toJpegBlob(canvas, quality);
      if (blob && blob.size <= MAX_UPLOAD_BYTES) {
        return { blob, name: toJpegName(file.name) };
      }
    }
  }

  return { blob: file, name: file.name };
};
