import L, { Marker, LatLng, IconOptions, Icon } from 'leaflet';
import type { MarkerOptions, DivIcon, PointExpression } from 'leaflet';

interface RotatableMarkerOptions {
  rotationOrigin?: string;
  rotationAngle?: number;
  icon: Icon<IconOptions> | DivIcon | undefined;
}

interface RotatableMarker extends Omit<Marker, 'on'> {
  options: RotatableMarkerOptions;
  _applyRotation(): void;
  _icon: HTMLElement;
  update(): void;
  on(type: string, fn: (event: any) => void, context?: any): this;
  setRotationAngle(angle: number): this;
  setRotationOrigin(origin: string): this;
}

export const makeLeafletMarkerRotatable = (
  MarkerClass: typeof Marker,
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
        this._icon.style[L.DomUtil.TRANSFORM + 'Origin'] =
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
