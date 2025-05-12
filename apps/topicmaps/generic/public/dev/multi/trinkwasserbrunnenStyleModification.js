function styleManipulation(markerSymbolSize, style) {
  const scale = (markerSymbolSize / 35) * 1.35;
  const newStyle = JSON.parse(JSON.stringify(style)); // Deep clone

  // trinkwasserbrunnen-selection icon-size
  const selection = newStyle.layers.find(
    (l) => l.id === "trinkwasserbrunnen-selection"
  );
  if (selection) {
    selection.layout["icon-size"].stops[0][1] *= scale;
    selection.layout["icon-size"].stops[1][1] *= scale;
  }

  // trinkwasserbrunnen-poi-images icon-size
  const images = newStyle.layers.find(
    (l) => l.id === "trinkwasserbrunnen-poi-images"
  );
  if (images) {
    images.layout["icon-size"].stops[0][1] *= scale;
    images.layout["icon-size"].stops[1][1] *= scale;
  }

  // trinkwasserbrunnen-poi-labels text-size and text-offset
  const labels = newStyle.layers.find(
    (l) => l.id === "trinkwasserbrunnen-poi-labels"
  );
  if (labels) {
    labels.layout["text-size"] *= scale;
    labels.layout["text-offset"].stops[0][1][1] *= scale;
    labels.layout["text-offset"].stops[1][1][1] *= scale;
  }

  return newStyle;
}
