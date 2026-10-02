import { useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
  Map as MapLibreMap,
  MercatorCoordinate,
  type CustomLayerInterface,
} from "maplibre-gl";
import {
  BoxGeometry,
  Camera,
  Color,
  DoubleSide,
  GridHelper,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "three";
import { degToRadNumeric, type Degrees } from "@carma-units";

import {
  flyToPose,
  settleToPitch,
} from "../../../../../../libraries/mapping/oblique-viewer/src/lib/runtime/utils/flyToImage";
import { acquirePreviewProjectionWindow } from "../../../../../../libraries/mapping/oblique-viewer/src/lib/runtime/utils/preview-projection-window";
import type { CameraFlight } from "../../../../../../libraries/mapping/oblique-viewer/src/lib/runtime/utils/obliqueCamera";

import "maplibre-gl/dist/maplibre-gl.css";

type Args = {
  horizontalPan: number;
  verticalPan: number;
  startFovDeg: number;
  endFovDeg: number;
  trackX: number;
  trackY: number;
  durationMs: number;
};
type Measurements = {
  positionError: number;
  scaleError: number;
  horizontalScale: number;
  verticalScale: number;
  zoom: number;
  fov: number;
  running: boolean;
};

const PanCancellation = (args: Args) => {
  const container = useRef<HTMLDivElement>(null);
  const actions = useRef<{
    run: () => void;
    reverse: () => void;
    reset: () => void;
  }>();
  const [measurement, setMeasurement] = useState<Measurements>();
  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibreMap({
      container: container.current,
      center: [7.2, 51.27],
      zoom: 18.5,
      pitch: 45,
      bearing: 20,
      maxZoom: 30,
      maxPitch: 85,
      interactive: false,
      attributionControl: false,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#12202b" },
          },
        ],
      },
    });
    const release = acquirePreviewProjectionWindow(map);
    const scene = new Scene();
    const camera = new Camera();
    const origin = MercatorCoordinate.fromLngLat([7.2, 51.27]);
    const units = origin.meterInMercatorCoordinateUnits();
    const localToMercator = new Matrix4()
      .makeTranslation(origin.x, origin.y, 0)
      .scale(new Vector3(units, units, units));
    const right = new Vector3(
      Math.cos(degToRadNumeric(20)),
      Math.sin(degToRadNumeric(20)),
      0
    );
    const up = new Vector3(
      Math.sin(degToRadNumeric(20)) * Math.cos(degToRadNumeric(45)),
      -Math.cos(degToRadNumeric(20)) * Math.cos(degToRadNumeric(45)),
      Math.sin(degToRadNumeric(45))
    );
    const marker = new Mesh(
      new PlaneGeometry(14, 14),
      new MeshBasicMaterial({
        color: "#ffdb45",
        side: DoubleSide,
        depthTest: false,
      })
    );
    marker.setRotationFromMatrix(
      new Matrix4().makeBasis(right, up, right.clone().cross(up))
    );
    marker.renderOrder = 1;
    scene.add(marker);
    // Synthetic geometry is the only fixture boundary: navigation uses the
    // same MapLibre transform and return implementation as the oblique viewer.
    const grid = new GridHelper(
      1800,
      90,
      new Color("#516875"),
      new Color("#29424f")
    );
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);
    for (let x = -600; x <= 600; x += 100) {
      for (let y = -600; y <= 600; y += 100) {
        const height = 12 + ((x / 100 + y / 100 + 12) % 4) * 15;
        const mesh = new Mesh(
          new BoxGeometry(24, 24, height),
          new MeshBasicMaterial({
            color: new Color().setHSL(
              (x + 600) / 1800,
              0.38,
              0.4 + (y + 600) / 6000
            ),
          })
        );
        mesh.position.set(x, y, height / 2);
        scene.add(mesh);
      }
    }
    let renderer: WebGLRenderer | undefined;
    const layer: CustomLayerInterface = {
      id: "tracking-fixture",
      type: "custom",
      renderingMode: "3d",
      onAdd: (_map, gl) => {
        renderer = new WebGLRenderer({ canvas: map.getCanvas(), context: gl });
        renderer.autoClear = false;
      },
      render: (_gl, frame) => {
        if (!renderer) return;
        camera.projectionMatrix
          .fromArray(frame.defaultProjectionData.mainMatrix)
          .multiply(localToMercator);
        renderer.resetState();
        renderer.render(scene, camera);
      },
    };
    let flight: CameraFlight | undefined;
    let imagePose: Parameters<typeof flyToPose>[1] | undefined;
    let imageAltitude = 0;
    let target = origin;
    let baseline: { horizontal: number; vertical: number };
    let positionError = 0;
    let scaleError = 0;
    let running = false;
    const screenPoint = { x: 0, y: 0 };
    const project = (point: Vector3): Vector3 => {
      const transform = map.transform;
      const mercator = new Vector4(point.x, point.y, point.z, 1).applyMatrix4(
        new Matrix4()
          .fromArray(transform.getProjectionDataForCustomLayer().mainMatrix)
          .multiply(localToMercator)
      );
      return new Vector3(
        ((mercator.x / mercator.w + 1) * transform.width) / 2,
        ((1 - mercator.y / mercator.w) * transform.height) / 2,
        0
      );
    };
    const measure = () => {
      if (!baseline) return;
      const centre = project(marker.position);
      const horizontal = project(
        marker.position.clone().addScaledVector(right, 1)
      ).distanceTo(centre);
      const vertical = project(
        marker.position.clone().addScaledVector(up, 1)
      ).distanceTo(centre);
      positionError = Math.max(
        positionError,
        Math.hypot(centre.x - screenPoint.x, centre.y - screenPoint.y)
      );
      scaleError = Math.max(
        scaleError,
        Math.abs(horizontal / baseline.horizontal - 1),
        Math.abs(vertical / baseline.vertical - 1)
      );
      setMeasurement({
        positionError,
        scaleError,
        horizontalScale: horizontal / baseline.horizontal,
        verticalScale: vertical / baseline.vertical,
        zoom: map.getZoom(),
        fov: map.getVerticalFieldOfView(),
        running,
      });
    };
    const reset = () => {
      flight?.cancel();
      flight = undefined;
      running = false;
      map.setCenterClampedToGround(false);
      map.setVerticalFieldOfView(args.startFovDeg);
      map.jumpTo({
        center: [7.2, 51.27],
        zoom: 18.5,
        pitch: 45,
        bearing: 20,
        elevation: 0,
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
      });
      map.setPadding({
        left: Math.max(0, args.horizontalPan * map.transform.width * 2),
        right: Math.max(0, -args.horizontalPan * map.transform.width * 2),
        top: Math.max(0, args.verticalPan * map.transform.height * 2),
        bottom: Math.max(0, -args.verticalPan * map.transform.height * 2),
      });
      const eye = map.transform.getCameraLngLat();
      imageAltitude = map.transform.getCameraAltitude();
      imagePose = {
        longitude: eye.lng,
        latitude: eye.lat,
        z: imageAltitude,
        bearingDeg: map.getBearing(),
        pitchDeg: map.getPitch(),
        rollDeg: 0,
        direction: [0, 0, -1],
        up: [0, 1, 0],
        utmConvergenceRad: 0,
      };
      screenPoint.x = map.transform.width * args.trackX;
      screenPoint.y = map.transform.height * args.trackY;
      target = MercatorCoordinate.fromLngLat(
        map.unproject([screenPoint.x, screenPoint.y])
      );
      marker.position.set(
        (target.x - origin.x) / units,
        (target.y - origin.y) / units,
        0
      );
      const centre = project(marker.position);
      baseline = {
        horizontal: project(
          marker.position.clone().addScaledVector(right, 1)
        ).distanceTo(centre),
        vertical: project(
          marker.position.clone().addScaledVector(up, 1)
        ).distanceTo(centre),
      };
      positionError = 0;
      scaleError = 0;
      measure();
      map.triggerRepaint();
    };
    actions.current = {
      reset,
      reverse: () => {
        if (!imagePose) return;
        flight?.cancel();
        running = true;
        flight = flyToPose(
          map,
          imagePose,
          imageAltitude,
          { duration: args.durationMs },
          { dynamicDuration: false, anchor: target, screenPoint }
        );
        const current = flight;
        void current.done.then(() => {
          if (flight !== current) return;
          running = false;
          measure();
        });
      },
      run: () => {
        flight?.cancel();
        running = true;
        flight = settleToPitch(map, 45, {
          anchor: target,
          screenPoint,
          fovDeg: args.endFovDeg as Degrees,
          padding: { left: 0, right: 0, top: 0, bottom: 0 },
          maxZoom: 30,
          durationMs: args.durationMs,
          restoreGround: false,
        });
        const current = flight;
        void current.done.then(() => {
          if (flight !== current) return;
          running = false;
          measure();
        });
      },
    };
    map.on("load", () => {
      map.addLayer(layer);
      reset();
    });
    map.on("render", measure);
    return () => {
      actions.current = undefined;
      flight?.cancel();
      release();
      map.remove();
      scene.traverse((object) => {
        if (object instanceof Mesh || object instanceof GridHelper) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer?.dispose();
    };
  }, [
    args.horizontalPan,
    args.verticalPan,
    args.startFovDeg,
    args.endFovDeg,
    args.trackX,
    args.trackY,
    args.durationMs,
  ]);
  return (
    <section
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        font: "13px system-ui",
      }}
    >
      <header style={{ padding: "8px 12px", background: "#f5f5f5" }}>
        Track the yellow target while cancelling the off-centre projection.
        Pitch and bearing stay fixed. Sideways parallax is expected; target
        position and both camera-plane pixel scales must stay fixed.
      </header>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div ref={container} style={{ position: "absolute", inset: 0 }} />
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: `${args.trackX * 100}%`,
            top: `${args.trackY * 100}%`,
            transform: "translate(-50%, -50%)",
            color: "#fff",
            pointerEvents: "none",
            fontSize: 30,
          }}
        >
          ＋
        </span>
        <div
          style={{
            position: "absolute",
            right: 10,
            bottom: 10,
            background: "#fffffff0",
            padding: 8,
          }}
        >
          <button onClick={() => actions.current?.run()}>
            Cancel pan with compensation
          </button>{" "}
          <button onClick={() => actions.current?.reverse()}>
            Fly back to image camera
          </button>{" "}
          <button onClick={() => actions.current?.reset()}>Reset</button>
          <output style={{ display: "block", marginTop: 6 }} aria-live="polite">
            {measurement
              ? `${
                  measurement.running ? "Moving" : "Idle"
                } · max position error ${measurement.positionError.toFixed(
                  4
                )} px · max scale error ${(
                  measurement.scaleError * 100
                ).toFixed(4)}% · X ${(
                  measurement.horizontalScale * 100
                ).toFixed(4)}% · Y ${(measurement.verticalScale * 100).toFixed(
                  4
                )}% · FOV ${measurement.fov.toFixed(
                  3
                )}° · zoom ${measurement.zoom.toFixed(3)}`
              : "Loading fixture…"}
          </output>
        </div>
      </div>
    </section>
  );
};

const meta = {
  title: "Map Navigation/Camera and Scale/Off-center Pan Cancellation",
  id: "geo-off-center-pan-cancellation",
  component: PanCancellation,
  parameters: { layout: "fullscreen" },
  args: {
    horizontalPan: 0.85,
    verticalPan: 0.15,
    startFovDeg: 30,
    endFovDeg: 30,
    trackX: 0.5,
    trackY: 0.5,
    durationMs: 3000,
  },
  argTypes: {
    horizontalPan: { control: { type: "range", min: -2, max: 2, step: 0.05 } },
    verticalPan: {
      control: { type: "range", min: -0.3, max: 0.3, step: 0.05 },
    },
    startFovDeg: { control: { type: "range", min: 0.1, max: 70, step: 0.1 } },
    endFovDeg: { control: { type: "range", min: 0.1, max: 70, step: 0.1 } },
    trackX: { control: { type: "range", min: 0.2, max: 0.8, step: 0.05 } },
    trackY: { control: { type: "range", min: 0.3, max: 0.7, step: 0.05 } },
    durationMs: { control: { type: "range", min: 500, max: 6000, step: 100 } },
  },
} satisfies Meta<typeof PanCancellation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PanOnly: Story = {};
export const PanAndDollyZoom: Story = {
  args: { startFovDeg: 0.5, endFovDeg: 10 },
};
export const OffCenterTarget: Story = { args: { trackX: 0.35, trackY: 0.6 } };
