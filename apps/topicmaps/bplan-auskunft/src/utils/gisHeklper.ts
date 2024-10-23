export function getPolygonfromBBox(bbox) {
  return (
    'POLYGON((' +
    bbox.left +
    ' ' +
    bbox.top +
    ',' +
    bbox.right +
    ' ' +
    bbox.top +
    ',' +
    bbox.right +
    ' ' +
    bbox.bottom +
    ',' +
    bbox.left +
    ' ' +
    bbox.bottom +
    ',' +
    bbox.left +
    ' ' +
    bbox.top +
    '))'
  );
}
