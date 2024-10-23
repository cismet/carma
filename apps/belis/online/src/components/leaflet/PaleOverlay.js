import L from 'leaflet';

class PaleOverlay {
  createLeafletElement(props) {
    const EEE = L.GridLayer.extend({
      createTile: function (coords) {
        var tile = document.createElement('div');
        // tile.innerHTML = '<div style="color:white"></div>'; //[coords.x, coords.y, coords.z].join(", ");
        // tile.innerHTML = [coords.x, coords.y, coords.z].join(", ");
        //tile.style.outline = "1px solid red";
        tile.style.background = '#ffffffcc';

        return tile;
      },
    });
    const layer = new EEE();
    return layer;
  }

  updateLeafletElement(fromProps, toProps) {
    super.updateLeafletElement(fromProps, toProps);
  }
}

export default PaleOverlay;
