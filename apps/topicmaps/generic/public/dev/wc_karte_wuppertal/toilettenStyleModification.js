function styleManipulation(markerSymbolSize, style) {
  const scale = (markerSymbolSize / 35) * 1.01;
  const newStyle = JSON.parse(JSON.stringify(style)); // Deep clone

  // toiletten-selection icon-size
  const selection = newStyle.layers.find(
    (l) => l.id === "toiletten-selection"
  );
  if (selection) {
    selection.layout["icon-size"].stops[0][1] *= scale;
    selection.layout["icon-size"].stops[1][1] *= scale;
  }

  // toiletten-icons icon-size
  const icons = newStyle.layers.find(
    (l) => l.id === "toiletten-icons"
  );
  if (icons) {
    icons.layout["icon-size"].stops[0][1] *= scale;
    icons.layout["icon-size"].stops[1][1] *= scale;
  }

  return newStyle;
}
