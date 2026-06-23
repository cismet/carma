// Shared pannellum viewer types + scene resolution for the panorama viewers
// (PanoramaPreview / PanoramaLightBox).

export type PannellumViewer = {
  destroy: () => void;
  resize: () => void;
  getYaw: () => number;
  isLoaded: () => boolean;
};

/**
 * Resolve the pannellum scene config for a panorama.
 *
 * When a multiresolution config URL is given, fetch pannellum's generated
 * `config.json` and attach a `basePath` (the config's own directory) so
 * pannellum can resolve the relative tile paths — the generated config ships
 * none. A multires panorama paints a low-res cube immediately and refines,
 * which is far faster on first view than a single large equirectangular image.
 *
 * Falls back to a plain equirectangular image when there is no multires config
 * or it cannot be loaded, so panos that have not been tiled yet still work.
 */
export const resolvePanoramaScene = async (
  src: string,
  multiResConfigUrl?: string
): Promise<Record<string, unknown>> => {
  if (multiResConfigUrl) {
    try {
      const response = await fetch(multiResConfigUrl);
      if (!response.ok) {
        throw new Error(`multires config request failed: ${response.status}`);
      }
      const config = (await response.json()) as Record<string, unknown>;
      // basePath must NOT end in a slash: pannellum builds tile urls as
      // `basePath + path`, and the config's `path` already starts with "/".
      const basePath = multiResConfigUrl.replace(/\/config\.json(?:\?.*)?$/, "");
      return { ...config, basePath };
    } catch {
      // fall through to the equirectangular image
    }
  }
  return { type: "equirectangular", panorama: src };
};
