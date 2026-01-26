/**
 * Cluster visualization utilities for MapLibre GL
 */

/**
 * Create an SVG pie segment path
 */
function pieSegment(
  start: number,
  end: number,
  r: number,
  color: string
): string {
  if (end - start === 1) end -= 0.00001;
  const a0 = 2 * Math.PI * (start - 0.25);
  const a1 = 2 * Math.PI * (end - 0.25);
  const x0 = Math.cos(a0),
    y0 = Math.sin(a0);
  const x1 = Math.cos(a1),
    y1 = Math.sin(a1);
  const largeArc = end - start > 0.5 ? 1 : 0;

  return [
    '<path d="M',
    r,
    r,
    "L",
    r + r * x0,
    r + r * y0,
    "A",
    r,
    r,
    0,
    largeArc,
    1,
    r + r * x1,
    r + r * y1,
    "Z",
    `" fill="${color}" />`,
  ].join(" ");
}

/**
 * Create an SVG pie chart element for cluster visualization
 * @param props - Cluster properties containing color counts
 * @param uniqueColors - Array of unique color values used in the data
 * @returns HTMLElement containing the SVG pie chart
 */
export function createPieChart(
  props: Record<string, number>,
  uniqueColors: string[]
): HTMLElement {
  const offsets: number[] = [];
  const counts = uniqueColors.map((color) => props[color] || 0);
  let total = 0;
  for (let i = 0; i < counts.length; i++) {
    offsets.push(total);
    total += counts[i];
  }
  const baseFontsize = 10;
  const fontSize =
    total >= 1000
      ? baseFontsize * 1.375
      : total >= 100
      ? baseFontsize * 1.25
      : total >= 10
      ? baseFontsize * 1.125
      : baseFontsize;
  const baseCircleSize = 25;
  const r =
    total >= 1000
      ? baseCircleSize * 2.777
      : total >= 100
      ? baseCircleSize * 1.7777
      : total >= 10
      ? baseCircleSize * 1.3333
      : baseCircleSize;
  const w = r * 2;
  const svgSize = w + 2; // 1px extra on each side

  let html = `<div><svg width="${svgSize}" height="${svgSize}" viewbox="0 0 ${svgSize} ${svgSize}" text-anchor="middle" style="font: ${fontSize}px sans-serif; display: block">`;

  // Translate the group to center the content in the larger SVG
  html += `<g transform="translate(1,1)">`;

  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > 0) {
      html += pieSegment(
        offsets[i] / total,
        (offsets[i] + counts[i]) / total,
        r,
        uniqueColors[i]
      );
    }
  }

  html += `<circle cx="${r}" cy="${r}" r="${Math.round(
    r * 0.4
  )}" fill="white" fill-opacity="0.75"/>`;
  html += `<circle cx="${r}" cy="${r}" r="${r}" stroke="#000" stroke-width="1" fill="none"/>`;
  html += `<text dominant-baseline="central" transform="translate(${r}, ${r})">${total.toLocaleString()}</text></g></svg></div>`;

  const el = document.createElement("div");
  el.innerHTML = html;
  return el.firstChild as HTMLElement;
}
