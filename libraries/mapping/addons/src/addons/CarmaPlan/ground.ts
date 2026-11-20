import {
  NO_DATA_BELOW,
  NRW_DGM1_TERRAIN,
  decodeHeight,
  loadTerrainPatch,
  type TileRect,
} from "../FloodSimulation/terrain-patch";

/**
 * Ground heights under a site from the NRW DGM1 (1 m, DHHN2016, the same
 * service the map's terrain uses), at the service's finest zoom: 0.75 m per
 * pixel in Wuppertal. The mesh carries absolute heights in the same datum, so
 * a planned surface built on these meets the mesh at the site edge.
 */

export type MercatorBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/** DGM height in metres at a Web Mercator point (0..1 units), or null */
export type GroundSampler = (mercX: number, mercY: number) => number | null;

/** most tiles one site may load; a bigger site drops a zoom level */
const MAX_TILES = 16;

const rectFor = (box: MercatorBox): TileRect => {
  for (
    let zoom = NRW_DGM1_TERRAIN.maxzoom;
    zoom > NRW_DGM1_TERRAIN.minzoom;
    zoom--
  ) {
    const n = 2 ** zoom;
    const x0 = Math.floor(box.minX * n);
    const y0 = Math.floor(box.minY * n);
    const cols = Math.floor(box.maxX * n) - x0 + 1;
    const rows = Math.floor(box.maxY * n) - y0 + 1;
    if (cols * rows <= MAX_TILES) return { zoom, x0, y0, cols, rows };
  }
  const zoom = NRW_DGM1_TERRAIN.minzoom;
  const n = 2 ** zoom;
  return {
    zoom,
    x0: Math.floor(box.minX * n),
    y0: Math.floor(box.minY * n),
    cols: 1,
    rows: 1,
  };
};

export const loadGroundSampler = async (
  box: MercatorBox
): Promise<GroundSampler> => {
  const rect = rectFor(box);
  const patch = await loadTerrainPatch(NRW_DGM1_TERRAIN, rect, (error) =>
    console.warn("[CARMA PLAN] DGM tile", error)
  );
  if (!patch.hasData) throw new Error("[CARMA PLAN] no DGM under the site");
  const context = patch.canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("[CARMA PLAN] 2d canvas context unavailable");
  const { width, height } = patch.canvas;
  const rgba = context.getImageData(0, 0, width, height).data;
  const heights = new Float32Array(width * height);
  for (let i = 0; i < heights.length; i++) {
    heights[i] = decodeHeight(
      rgba[4 * i],
      rgba[4 * i + 1],
      rgba[4 * i + 2],
      NRW_DGM1_TERRAIN.encoding
    );
  }
  const n = 2 ** rect.zoom;
  const { tileSize } = patch;
  const at = (px: number, py: number) => {
    const x = Math.min(width - 1, Math.max(0, px));
    const y = Math.min(height - 1, Math.max(0, py));
    return heights[y * width + x];
  };
  return (mercX, mercY) => {
    // pixel centres sit at half pixels
    const fx = (mercX * n - rect.x0) * tileSize - 0.5;
    const fy = (mercY * n - rect.y0) * tileSize - 0.5;
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    const tx = fx - x;
    const ty = fy - y;
    const h00 = at(x, y);
    const h10 = at(x + 1, y);
    const h01 = at(x, y + 1);
    const h11 = at(x + 1, y + 1);
    if (Math.min(h00, h10, h01, h11) < NO_DATA_BELOW) return null;
    return (
      (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty
    );
  };
};
