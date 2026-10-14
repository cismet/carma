import { AttributionControl } from "maplibre-gl";

/**
 * MapLibre's compact attribution, shown for a while and then removed. Whenever
 * the credits change, e.g. a background with another source comes in, it is
 * shown again for that long, so every new credit is on screen at least once.
 * Map interaction does not affect it. The OSMF attribution guidelines allow
 * this ("automatically after five seconds") as long as the licence stays
 * findable elsewhere, e.g. in the app's menu.
 */
export class TransientAttributionControl extends AttributionControl {
  private readonly hideAfterMs: number;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;

  constructor({
    hideAfterMs,
    customAttribution,
  }: {
    hideAfterMs: number;
    customAttribution?: string | string[];
  }) {
    super({ compact: true, customAttribution });
    this.hideAfterMs = hideAfterMs;
    // the compact control collapses on the first drag; this one leaves the map alone
    this._updateCompactMinimize = () => {};
  }

  override _updateAttributions() {
    const previous = this._attribHTML;
    super._updateAttributions();
    if (this._attribHTML && this._attribHTML !== previous) {
      this.reveal();
    }
  }

  override onRemove() {
    clearTimeout(this.hideTimer);
    super.onRemove();
  }

  private reveal() {
    // an empty control stays hidden by MapLibre's own `maplibregl-attrib-empty`
    this._container.style.display = "";
    // the first credits open it; later ones may find it collapsed by the ⓘ
    if (this._container.classList.contains("maplibregl-compact")) {
      this._container.setAttribute("open", "");
      this._container.classList.add("maplibregl-compact-show");
    }
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this._container.style.display = "none";
    }, this.hideAfterMs);
  }
}
