// Create a class for the plugin
L.Control.MeasurePolygon = L.Control.extend({
  options: {
    position: "topright",
    icon_lineActive: "https://img.icons8.com/?size=48&id=98497&format=png",
    icon_lineInactive: "https://img.icons8.com/?size=48&id=98463&format=png",
    height: 130,
    width: 150,
    checkonedrawpoligon: false,
    cbToggleMeasurementMode: function () {
      console.debug("[Measure] ToggleMeasurementMode");
    },
  },

  onAdd: function (map) {
    const linesContainer = L.DomUtil.create(
      "div",
      "leaflet-bar leaflet-control m-container"
    );

    const lineIcon = L.DomUtil.create("a", "", linesContainer);
    lineIcon.innerHTML = `
    <div class="measure_icon_wrapper">
      <img id="img_plg_lines" class='mesure_icon' src="${this.options.icon_lineInactive}" alt="Ruler Icon">
    </div>
  `;
    lineIcon.href = "#";
    lineIcon.title = "Flächen- und Umfangsmessungen";

    const iconsWrapper = L.DomUtil.create("div", "m-icons-wrapper");
    iconsWrapper.appendChild(linesContainer);

    L.DomEvent.on(
      lineIcon,
      "click",
      (event) => {
        event.preventDefault(); // Prevent default action (e.g., redirection)
        this.toggleMeasurementMode();
      },
      this
    );

    return iconsWrapper;
  },
  _toggleMeasure: function (btnId = "", activeIcon = "", inactiveIcon = "") {
    // this.options.cb(true);

    if (this.options.checkonedrawpoligon) {
      document.getElementById("img_plg_lines").src =
        this.options.icon_lineInactive;
      this.options.checkonedrawpoligon = false;
    } else {
      document.getElementById("img_plg_lines").src =
        this.options.icon_lineActive;
      this.options.checkonedrawpoligon = true;
    }
  },
  toggleMeasurementMode: function () {
    this._toggleMeasure();
    this.options.cbToggleMeasurementMode();
  },
});

L.control.measurePolygon = function (options) {
  return new L.Control.MeasurePolygon(options);
};
