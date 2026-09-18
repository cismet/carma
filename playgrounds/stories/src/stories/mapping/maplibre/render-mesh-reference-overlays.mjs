// Deterministic screenshot diagnostics, not image registration or mesh correction.
// Run from the repository root; requires ImageMagick.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { MathUtils } from 'three';

const folder = resolve('output/playwright');
const width = 2400, height = 1400;
// Same crop, without resampling, in all source screenshots. Canvas: x=2,
// y=120.390625, 3932×1778 device pixels; CSS viewport 1966×889, DPR=2.
const cropX = 768, cropY = 309;
const cx = 1968 - cropX, cy = 1009.390625 - cropY;
const worldPixels = 512 * 2 ** 17 * 2;
const a = 6378137, e2 = 6.6943799901413165e-3;
const sites = [
  { id: 'origin', title: 'Mount-Ursprung', lon: 7.163461249942009, lat: 51.24111123027258 },
  { id: 'beyenburg', title: 'Stoffelsberg bei Beyenburg', lon: 7.301936111, lat: 51.23815 },
];
// Independently matched image points, in original screenshot device pixels.
// Mesh: SIFT/RANSAC inliers, then visually checked against original crops.
// LoD2: manually identified corresponding roof/footprint vertex, independently
// refined by goodFeaturesToTrack in a 33px neighbourhood (not model-guided fit).
const landmarks = {
  origin: {
    mesh: { source: [1892.1917724609375, 1059.617431640625], reference: [1894.468017578125, 1062.071533203125], method: 'Dach-/Randdetail · SIFT-Paar, visuell geprüft' },
    lod2: { source: [1953, 758], reference: [1951, 757], method: 'Nördliche Gebäudeecke · visuell zugeordnet' },
  },
  beyenburg: {
    mesh: { source: [1978.4932861328125, 1032.5162353515625], reference: [1810.43212890625, 1081.6265869140625], method: 'Wohnmobil-Dachdetail · SIFT-Paar, visuell geprüft' },
    lod2: { source: [2549, 562], reference: [2378, 610], method: 'Nördliche Ecke des kleinen Einzelgebäudes' },
  },
};
const ecef = (lon, lat) => {
  const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  return [n * Math.cos(lat) * Math.cos(lon), n * Math.cos(lat) * Math.sin(lon), n * (1 - e2) * Math.sin(lat)];
};
function magick(args, input) {
  const result = spawnSync('magick', args, { input, maxBuffer: 100 * 1024 ** 2 });
  assert.equal(result.status, 0, result.stderr?.toString());
  return result.stdout;
}
function pixels(file, edges = false, thresholds = '10%+25%', sigma = 1) {
  const args = [resolve(folder, file), '-crop', `${width}x${height}+${cropX}+${cropY}`, '+repage', '-colorspace', 'Gray'];
  if (edges) args.push('-canny', `0x${sigma}+${thresholds}`, '-morphology', 'Dilate', 'Disk:1');
  return magick([...args, '-depth', '8', 'gray:-']);
}
function localGrid(site) {
  const lon = MathUtils.degToRad(site.lon), lat = MathUtils.degToRad(site.lat);
  const sin = Math.sin(lat), cos = Math.cos(lat);
  const n = a / Math.sqrt(1 - e2 * sin * sin);
  const m = a * (1 - e2) / (1 - e2 * sin * sin) ** 1.5;
  const root = [n * cos * Math.cos(lon), n * cos * Math.sin(lon), n * (1 - e2) * sin];
  const east = [-Math.sin(lon), Math.cos(lon), 0];
  const north = [-sin * Math.cos(lon), -sin * Math.sin(lon), cos];
  const merc = p => Math.log(Math.tan(Math.PI / 4 + p / 2));
  // Reference-only ENU plane at camera centre, h=0. Normal-project its points
  // onto WGS84 and then into normalized spherical Web Mercator. This does not
  // move the mesh root or use the ECEF mesh as a scale reference.
  function project(e, u) {
    const p = root.map((v, i) => v + e * east[i] + u * north[i]);
    const rho = Math.hypot(p[0], p[1]);
    let phi = Math.atan2(p[2], rho * (1 - e2));
    for (let i = 0; i < 8; i++) {
      const radius = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
      phi = Math.atan2(p[2] + e2 * radius * Math.sin(phi), rho);
    }
    return [cx + (Math.atan2(p[1], p[0]) - lon) * worldPixels / (2 * Math.PI),
      cy - (merc(phi) - merc(lat)) * worldPixels / (2 * Math.PI)];
  }
  const x10 = worldPixels * 10 / (2 * Math.PI * n * cos);
  const y10 = worldPixels * 10 / (2 * Math.PI * m * cos);
  assert(Math.hypot(...project(0, 0).map((v, i) => v - [cx, cy][i])) < 1e-6);
  assert(Math.abs(project(10, 0)[0] - cx - x10) < 1e-4);
  assert(Math.abs(cy - project(0, 10)[1] - y10) < 1e-3);
  const paths = [];
  for (let value = -300; value <= 300; value += 10) {
    for (const axis of [0, 1]) {
      const points = [];
      for (let other = -300; other <= 300; other += 10) points.push(project(...(axis ? [other, value] : [value, other])));
      const major = value % 50 === 0;
      paths.push(`<path d="${points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ')}" fill="none" stroke="#111" stroke-opacity="${major ? 0.52 : 0.24}" stroke-width="${major ? 1.5 : 0.8}"/>`);
      if (major) {
        const pos = axis ? project(-210, value) : project(value, 117);
        paths.push(`<text x="${pos[0]}" y="${pos[1]}" class="gridlabel">${value === 0 ? '0' : `${value > 0 ? '+' : ''}${value}`} m ${axis ? 'N' : 'E'}</text>`);
      }
    }
  }
  paths.push(`<path d="M${cx - 12},${cy}h24 M${cx},${cy - 12}v24" stroke="white" stroke-width="6"/><path d="M${cx - 12},${cy}h24 M${cx},${cy - 12}v24" stroke="#111" stroke-width="2"/>`);
  function geographic(pixel) {
    const longitude = lon + (pixel[0] - 1968) * 2 * Math.PI / worldPixels;
    const psi = merc(lat) - (pixel[1] - 1009.390625) * 2 * Math.PI / worldPixels;
    return [longitude, 2 * Math.atan(Math.exp(psi)) - Math.PI / 2];
  }
  function ground(pixel) {
    const p = ecef(...geographic(pixel)).map((v, i) => v - root[i]);
    return [p.reduce((v, x, i) => v + x * east[i], 0), p.reduce((v, x, i) => v + x * north[i], 0)];
  }
  return { svg: paths.join(''), x10, y10, geographic, ground, eastingGroundMetersPerCssPixel: 20 / x10, northingGroundMetersPerCssPixel: 20 / y10 };
}
function annotation(site, kind, grid) {
  const mark = landmarks[site.id][kind];
  const measured = grid.ground(mark.source).map((v, i) => v - grid.ground(mark.reference)[i]);
  const [lon, lat] = grid.geographic(mark.reference);
  const rootLon = MathUtils.degToRad(sites[0].lon), rootLat = MathUtils.degToRad(sites[0].lat);
  const d = ecef(lon, lat).map((v, i) => v - ecef(rootLon, rootLat)[i]);
  const east = -Math.sin(rootLon) * d[0] + Math.cos(rootLon) * d[1];
  const north = -Math.sin(rootLat) * Math.cos(rootLon) * d[0] - Math.sin(rootLat) * Math.sin(rootLon) * d[1] + Math.cos(rootLat) * d[2];
  const merc = p => Math.log(Math.tan(Math.PI / 4 + p / 2));
  const rootMetres = 6371008.8 * Math.cos(rootLat);
  const pixelScale = worldPixels / (2 * Math.PI * rootMetres);
  const predictedPixel = [mark.reference[0] + (east - rootMetres * (lon - rootLon)) * pixelScale,
    mark.reference[1] - (north - rootMetres * (merc(lat) - merc(rootLat))) * pixelScale];
  const predicted = grid.ground(predictedPixel).map((v, i) => v - grid.ground(mark.reference)[i]);
  const p = mark.reference.map((v, i) => v - [cropX, cropY][i]);
  const q = mark.source.map((v, i) => v - [cropX, cropY][i]);
  const fmt = x => x.toFixed(Math.abs(x) < 1 ? 2 : 1).replace('.', ',');
  const measuredDistance = Math.hypot(...measured), predictedDistance = Math.hypot(...predicted);
  const sourceColor = kind === 'mesh' ? '#00e1ff' : '#e82630';
  const referenceColor = kind === 'mesh' ? '#ff2dbe' : '#1858f0';
  const svg = `<circle cx="${p[0]}" cy="${p[1]}" r="9" fill="none" stroke="white" stroke-width="5"/>
    <circle cx="${p[0]}" cy="${p[1]}" r="9" fill="none" stroke="${referenceColor}" stroke-width="3"/>
    <circle cx="${q[0]}" cy="${q[1]}" r="5" fill="${sourceColor}" stroke="#111" stroke-width="2"/>
    <text x="${p[0] - 26}" y="${p[1] + 28}" font-size="23" stroke="white" stroke-width="3" paint-order="stroke">A</text>
    <g transform="translate(${q[0] + 20} ${q[1] - 70})" stroke="white" stroke-width="4" stroke-linejoin="round" paint-order="stroke">
      <text x="0" y="0" font-size="28" font-weight="bold">A · ${fmt(measuredDistance)} m gemessen</text>
      <text x="0" y="32" font-size="23">${fmt(predictedDistance)} m Modell · WGS84 h=0</text>
      <text x="0" y="60" font-size="19">${kind === 'lod2' ? 'Ablesung ca. ±1 m · Dach ≠ Grundriss' : 'Bilddetail visuell gegengeprüft'}</text>
    </g>`;
  return { svg, measurement: { ...mark, measuredEastNorthMeters: measured, measuredDistanceMeters: measuredDistance,
    predictedEastNorthMeters: predicted, predictedDistanceMeters: predictedDistance,
    direction: 'source relative to reference', hypothesis: 'WGS84 h=0, fixed original root and uncorrected mean-radius MapLibre mount',
    visualCheck: 'original crops inspected; not proof of dataset datum' } };
}
const manifest = { capture: { zoom: 17, pitch: 0, bearing: 0, dpr: 2, verticalFovDegrees: 0.1,
  mountOrigin: [sites[0].lon, sites[0].lat], anchor: 'fixed-root', cameraLocalFit: false, flattenMesh: false },
  crop: { x: cropX, y: cropY, width, height, sourceWidth: 3936, sourceHeight: 2088 },
  processing: 'Identical integer crop; no resampling, shift, registration, warp or generative editing. Canny photo sigma 2 thresholds 15%/35%, LoD2 sigma 1 thresholds 10%/25%, low-contrast basemap sigma 1 thresholds 2%/6%, radius-1 dilation.',
  grid: '10 m local WGS84 ENU at h=0 of image centre, normal-projected to ellipsoid, then spherical Web Mercator; not 10 projected EPSG:3857 metres or MapLibre mean-radius nominal metres.', outputs: [] };
for (const site of sites) {
  const grid = localGrid(site);
  for (const kind of ['mesh', 'lod2']) {
    const marked = annotation(site, kind, grid);
    const first = `verify-${site.id}-${kind === 'mesh' ? 'mesh' : 'lod2-only'}.webp`;
    const second = `verify-${site.id}-${kind === 'mesh' ? 'ortho' : 'basemap-only'}.webp`;
    for (const file of [first, second]) {
      const size = magick(['identify', '-format', '%wx%h', resolve(folder, file)]).toString();
      assert.equal(size, '3936x2088', file);
    }
    const p = pixels(first), q = pixels(second);
    const pe = pixels(first, true, kind === 'mesh' ? '15%+35%' : '10%+25%', kind === 'mesh' ? 2 : 1);
    const qe = pixels(second, true, kind === 'mesh' ? '15%+35%' : '2%+6%', kind === 'mesh' ? 2 : 1);
    const rgb = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      // Cyan/magenta contour separation over a subdued 50:50 photographic
      // composite. LoD2: red silhouettes/edges against a blue-tinted map.
      const base = kind === 'mesh' ? 35 + (p[i] + q[i]) * 0.38 : 175 + q[i] * 0.28;
      const fillA = kind === 'lod2' && p[i] < 175 ? 0.20 : 0;
      const fillB = kind === 'lod2' ? (255 - q[i]) / 255 * 0.20 : 0;
      const alpha = Math.max(fillA, pe[i] / 255 * 0.94);
      const beta = Math.max(fillB, qe[i] / 255 * 0.94);
      const colorA = kind === 'mesh' ? [0, 225, 255] : [232, 38, 48];
      const colorB = kind === 'mesh' ? [255, 45, 190] : [24, 88, 240];
      const common = Math.min(alpha, beta), onlyA = alpha - common, onlyB = beta - common;
      const colorCommon = kind === 'mesh' ? [255, 255, 255] : [137, 38, 172];
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(base * (1 - Math.max(alpha, beta)) + colorA[c] * onlyA + colorB[c] * onlyB + colorCommon[c] * common);
    }
    const png = magick(['-size', `${width}x${height}`, '-depth', '8', 'rgb:-', 'png:-'], rgb);
    const id = `verify-${site.id}-${kind}-overlay-grid`;
    const label = kind === 'mesh' ? 'Mesh 2024: Cyan · True Ortho 2024: Magenta · gemeinsame Kanten: Weiß' : 'LoD2: Rot · Basemap: Blau · gemeinsame Kanten: Violett';
    const footer = kind === 'mesh' ? 'Mesh und True Ortho 03/2024: © Stadt Wuppertal' : 'LoD2: © Stadt Wuppertal · Stadtplan: © RVR';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + 250}" viewBox="0 0 ${width} ${height + 250}">
      <style>text{font-family:Arial,sans-serif;fill:#17212b}.gridlabel{font-size:18px;fill:#101820;paint-order:stroke;stroke:#fff;stroke-width:2px;stroke-opacity:.8}</style>
      <defs><clipPath id="map-clip"><rect x="0" y="0" width="${width}" height="${height}"/></clipPath></defs>
      <rect width="100%" height="100%" fill="white"/>
      <text x="30" y="46" font-size="34" font-weight="bold">${site.title} · ${kind === 'mesh' ? 'Mesh / Orthofoto' : 'LoD2 / Basemap'}</text>
      <text x="30" y="86" font-size="25">${label}</text>
      <text x="30" y="124" font-size="22">Fester originaler Mesh-Root · keine lokale Anpassung / Abflachung · keine Bildverschiebung</text>
      <g transform="translate(0 150)" clip-path="url(#map-clip)">
        <image width="${width}" height="${height}" href="data:image/png;base64,${png.toString('base64')}"/>${grid.svg}${marked.svg}
      </g>
      <text x="30" y="${height + 183}" font-size="22">Raster: 10 m lokal Ost/Nord · 0 = Bildzentrum ${site.lon.toFixed(7)}° E / ${site.lat.toFixed(7)}° N · Norden oben</text>
      <text x="30" y="${height + 212}" font-size="20">Web-Mercator-Projektion · 10 m = ${grid.x10.toFixed(3)} Bildpx Ost / ${grid.y10.toFixed(3)} Bildpx Nord · DPR 2 · FOV 0,1°</text>
      <text x="30" y="${height + 240}" font-size="19">${footer} · Kantenfilter, keine Vermessungsgenauigkeit zugesichert; Dächer ≠ generalisierte Grundrisse.</text>
    </svg>`;
    writeFileSync(resolve(folder, `${id}.svg`), svg);
    manifest.outputs.push({ id, sources: [first, second], centre: [site.lon, site.lat], x10: grid.x10, y10: grid.y10,
      eastingGroundMetersPerCssPixel: grid.eastingGroundMetersPerCssPixel, northingGroundMetersPerCssPixel: grid.northingGroundMetersPerCssPixel,
      landmark: marked.measurement });
    console.log(`${id}: measured ${marked.measurement.measuredDistanceMeters.toFixed(3)} m; model ${marked.measurement.predictedDistanceMeters.toFixed(3)} m`);
  }
}
writeFileSync(resolve(folder, 'verify-overlays-manifest.json'), JSON.stringify(manifest, null, 2));
