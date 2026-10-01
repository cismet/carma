import { useEffect, useId, useRef, useState } from "react";
import { CanvasTexture, SRGBColorSpace, Texture, LinearFilter } from "three";
import type { Map as MaplibreMap } from "maplibre-gl";
import { acquireSharedThreeScene } from "@carma-mapping/engines/maplibre";
import {
  degToRad,
  type CssPixels,
  type DevicePixels,
  type Degrees,
} from "@carma-units";
import {
  nativePreviewTextureTransform,
  type NativePreviewWindow,
} from "../../core/utils/native-preview-window";
import { readCameraToCenterDistancePx } from "../utils/cameraMath";

/** Image slot in the existing scene: mesh color, photograph, draped labels, floating labels. */
export const useScenePreviewImage = ({
  map,
  source,
  revision = 0,
  shown,
  halfFovTan,
  nativeSize,
  principal,
  rollDeg,
  crop,
  priority = 0,
}: {
  map: MaplibreMap;
  source: HTMLImageElement | HTMLCanvasElement | null;
  revision?: number;
  shown: boolean;
  halfFovTan: number;
  nativeSize: { width: DevicePixels; height: DevicePixels };
  principal: { xOffset: number; yOffset: number };
  rollDeg: number;
  crop?: NativePreviewWindow["source"];
  priority?: number;
}): boolean => {
  const id = useId();
  const leaseRef = useRef<ReturnType<typeof acquireSharedThreeScene> | null>(
    null
  );
  const textureRef = useRef<Texture | null>(null);
  const opacityRef = useRef(0);
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const lease = acquireSharedThreeScene(map);
    leaseRef.current = lease;
    setAvailable(!!lease.layer.setMapStyleScreenOverlay);
    return () => {
      lease.layer.setMapStyleScreenOverlay?.(id, null);
      leaseRef.current = null;
      lease.release();
    };
  }, [map, id]);
  useEffect(() => {
    if (!source) return;
    const texture =
      source instanceof HTMLCanvasElement
        ? new CanvasTexture(source)
        : new Texture(source);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    textureRef.current = texture;
    return () => {
      leaseRef.current?.layer.setMapStyleScreenOverlay?.(id, null);
      textureRef.current = null;
      texture.dispose();
    };
  }, [map, source, source?.width, source?.height, id]);
  useEffect(() => {
    const texture = textureRef.current;
    if (texture) texture.needsUpdate = true;
  }, [source, revision]);
  useEffect(() => {
    const layer = leaseRef.current?.layer;
    if (!layer?.setMapStyleScreenOverlay) return;
    const sync = () => {
      const texture = textureRef.current;
      if (!shown || !texture) {
        layer.setMapStyleScreenOverlay?.(id, null);
        return;
      }
      const { width, height, centerOffset } = map.transform;
      const edge = 2 * readCameraToCenterDistancePx(map) * halfFovTan;
      const aspect = nativeSize.width / nativeSize.height;
      const image = {
        width: (aspect >= 1 ? edge : edge * aspect) as CssPixels,
        height: (aspect >= 1 ? edge / aspect : edge) as CssPixels,
      };
      layer.setMapStyleScreenOverlay?.(id, {
        texture,
        opacity: opacityRef.current,
        priority,
        viewportToTexture: nativePreviewTextureTransform(
          { width: width as CssPixels, height: height as CssPixels },
          image,
          nativeSize,
          { x: centerOffset.x as CssPixels, y: centerOffset.y as CssPixels },
          principal,
          degToRad(rollDeg as Degrees),
          crop
        ),
      });
    };
    let animation: number | null = null;
    if (!shown) opacityRef.current = 0;
    else if (priority > 0) opacityRef.current = 1;
    else if (opacityRef.current < 1 && textureRef.current) {
      const started = performance.now(),
        from = opacityRef.current;
      const fade = (now: number) => {
        const progress = Math.min(1, (now - started) / 250);
        opacityRef.current = from + (1 - from) * progress;
        sync();
        if (progress < 1) animation = requestAnimationFrame(fade);
      };
      animation = requestAnimationFrame(fade);
    }
    sync();
    map.on("render", sync);
    map.on("resize", sync);
    return () => {
      if (animation !== null) cancelAnimationFrame(animation);
      map.off("render", sync);
      map.off("resize", sync);
      layer.setMapStyleScreenOverlay?.(id, null);
    };
  }, [
    map,
    source,
    revision,
    shown,
    halfFovTan,
    nativeSize.width,
    nativeSize.height,
    principal.xOffset,
    principal.yOffset,
    rollDeg,
    crop,
    priority,
    id,
    available,
  ]);
  return available;
};
