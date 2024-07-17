/* eslint-disable */
// @ts-nocheck


import L, { Marker, MarkerOptions, LatLng, PointExpression } from 'leaflet';

interface RotatableMarkerOptions extends MarkerOptions {
  rotationOrigin?: string;
  rotationAngle?: number;
}

interface RotatableMarker extends Marker {
  options: RotatableMarkerOptions;
  _applyRotation(): void;
  _icon: HTMLElement;
  update(): void;
  setRotationAngle(angle: number): this;
  setRotationOrigin(origin: string): this;
}

export const makeLeafletMarkerRotatable = (
  MarkerClass: typeof Marker
): void => {
  const proto_initIcon = (MarkerClass.prototype as any)._initIcon;
  const proto_setPos = (MarkerClass.prototype as any)._setPos;

  MarkerClass.addInitHook(function (this: RotatableMarker) {
    const iconOptions = this.options.icon?.options;
    let iconAnchor = iconOptions?.iconAnchor;
    if (iconAnchor) {
      iconAnchor = `${iconAnchor[0]}px ${iconAnchor[1]}px` as any;
    }
    this.options.rotationOrigin = (this.options.rotationOrigin ||
      iconAnchor ||
      'center bottom') as any;
    this.options.rotationAngle = this.options.rotationAngle || 0;

    this.on('drag', function (e) {
      (e.target as RotatableMarker)._applyRotation();
    });
  });

  (MarkerClass as any).include({
    _initIcon: function (this: RotatableMarker) {
      proto_initIcon.call(this);
    },

    _setPos: function (this: RotatableMarker, pos: LatLng) {
      proto_setPos.call(this, pos);
      this._applyRotation();
    },

    _applyRotation: function (this: RotatableMarker) {
      if (this.options.rotationAngle) {
        this._icon.style[(L.DomUtil.TRANSFORM as string) + 'Origin'] =
          this.options.rotationOrigin;
        this._icon.style[
          L.DomUtil.TRANSFORM
        ] += ` rotateZ(${this.options.rotationAngle}rad)`;
      }
    },

    setRotationAngle: function (this: RotatableMarker, angle: number) {
      this.options.rotationAngle = angle;
      this.update();
      return this;
    },

    setRotationOrigin: function (this: RotatableMarker, origin: string) {
      this.options.rotationOrigin = origin;
      this.update();
      return this;
    },
  });
};
