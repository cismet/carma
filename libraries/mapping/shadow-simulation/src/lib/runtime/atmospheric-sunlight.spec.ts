// @vitest-environment node

import {
  IRRADIANCE_TEXTURE_HEIGHT,
  IRRADIANCE_TEXTURE_WIDTH,
  SCATTERING_TEXTURE_DEPTH,
  SCATTERING_TEXTURE_HEIGHT,
  SCATTERING_TEXTURE_WIDTH,
  SkyLightProbe,
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH,
} from "@takram/three-atmosphere";
import { Ellipsoid, Geodetic, radians } from "@takram/three-geospatial";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AtmosphericSunlightEvaluator,
  ecefDirectionToSceneDirection,
  evaluateAtmosphericSkyFrame,
  evaluateAtmosphericSunlight,
  getAtmosphericInputValidationError,
  getAtmosphericSkyFrameValidationError,
  getAtmosphericSunlightSampleValidationError,
  type AtmosphericObserver,
} from "./atmospheric-sunlight";

type TextureRequest = Readonly<{
  url: string;
  width?: number;
  height?: number;
  depth?: number;
  onLoad: (texture: THREE.Texture) => void;
  onError?: (error: unknown) => void;
}>;

const textureRequests = vi.hoisted(() => [] as TextureRequest[]);

vi.mock("@takram/three-geospatial", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@takram/three-geospatial")
  >();
  return {
    ...actual,
    createDataTextureLoader: vi.fn(
      (
        _parser: unknown,
        parameters?: Readonly<{ width?: number; height?: number }>
      ) => ({
        load: (
          url: string,
          onLoad: (texture: THREE.DataTexture) => void,
          _onProgress?: (event: ProgressEvent) => void,
          onError?: (error: unknown) => void
        ) => {
          textureRequests.push({
            url,
            width: parameters?.width,
            height: parameters?.height,
            onLoad: onLoad as (texture: THREE.Texture) => void,
            onError,
          });
        },
      })
    ),
    createData3DTextureLoader: vi.fn(
      (
        _parser: unknown,
        parameters?: Readonly<{
          width?: number;
          height?: number;
          depth?: number;
        }>
      ) => ({
        load: (
          url: string,
          onLoad: (texture: THREE.Data3DTexture) => void,
          _onProgress?: (event: ProgressEvent) => void,
          onError?: (error: unknown) => void
        ) => {
          textureRequests.push({
            url,
            width: parameters?.width,
            height: parameters?.height,
            depth: parameters?.depth,
            onLoad: onLoad as (texture: THREE.Texture) => void,
            onError,
          });
        },
      })
    ),
  };
});

const WUPPERTAL: AtmosphericObserver = {
  longitude: 7.15,
  latitude: 51.256,
  altitudeMeters: 180,
};

const createConstantTexture = (
  width: number,
  height: number,
  value = 1
): THREE.DataTexture => {
  const data = new Float32Array(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 1;
  }
  return new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType
  );
};

const createConstant3DTexture = (
  width: number,
  height: number,
  depth: number
): THREE.Data3DTexture =>
  new THREE.Data3DTexture(
    new Float32Array(width * height * depth * 4),
    width,
    height,
    depth
  );

const findTextureRequests = (filename: string): TextureRequest[] =>
  textureRequests.filter(({ url }) => url.endsWith(`/${filename}`));

describe("atmospheric sunlight", () => {
  beforeEach(() => {
    textureRequests.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps the local E/N/U basis to the shared E/U/S scene axes", () => {
    const ecef = new Geodetic(
      radians(WUPPERTAL.longitude),
      radians(WUPPERTAL.latitude),
      WUPPERTAL.altitudeMeters
    ).toECEF();
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    const up = new THREE.Vector3();
    Ellipsoid.WGS84.getEastNorthUpVectors(ecef, east, north, up);

    const eastScene = ecefDirectionToSceneDirection(east, WUPPERTAL);
    expect(eastScene.x).toBeCloseTo(1, 12);
    expect(eastScene.y).toBeCloseTo(0, 12);
    expect(eastScene.z).toBeCloseTo(0, 12);
    const northScene = ecefDirectionToSceneDirection(north, WUPPERTAL);
    expect(northScene.x).toBeCloseTo(0, 12);
    expect(northScene.y).toBeCloseTo(0, 12);
    expect(northScene.z).toBeCloseTo(-1, 12);
    const upScene = ecefDirectionToSceneDirection(up, WUPPERTAL);
    expect(upScene.x).toBeCloseTo(0, 12);
    expect(upScene.y).toBeCloseTo(1, 12);
    expect(upScene.z).toBeCloseTo(0, 12);
  });

  it("uses Takram's date and observer position for a local daytime sun", () => {
    const sample = evaluateAtmosphericSunlight(
      new Date("2026-06-21T10:00:00.000Z"),
      WUPPERTAL,
      null
    );

    expect(sample.directionToSun.length()).toBeCloseTo(1, 12);
    expect(sample.elevationDegrees).toBeGreaterThan(50);
    expect(sample.azimuthDegrees).toBeGreaterThan(90);
    expect(sample.azimuthDegrees).toBeLessThan(270);
    expect(sample.atmosphericTransmittanceReady).toBe(false);
    expect(sample.atmosphericIrradianceReady).toBe(false);
    expect(sample.skyIrradianceCoefficients).toBeNull();
    expect(sample.relativeIntensity).toBeGreaterThan(0);
  });

  it("keeps the sky ellipsoid fixed while the observer moves inside the AOI", () => {
    const instant = new Date("2026-06-21T10:00:00.000Z");
    const skyReference = {
      observer: {
        longitude: WUPPERTAL.longitude,
        latitude: WUPPERTAL.latitude,
        altitudeMeters: 0,
      },
      scenePosition: new THREE.Vector3(80, 0, -120),
    };
    const first = evaluateAtmosphericSunlight(
      instant,
      WUPPERTAL,
      null,
      null,
      skyReference
    );
    const second = evaluateAtmosphericSunlight(
      instant,
      {
        longitude: WUPPERTAL.longitude + 0.03,
        latitude: WUPPERTAL.latitude + 0.02,
        altitudeMeters: 420,
      },
      null,
      null,
      skyReference
    );

    expect(
      second.skyFrame.ecefToSceneMatrix.equals(first.skyFrame.ecefToSceneMatrix)
    ).toBe(true);
    expect(
      second.skyFrame.ellipsoidCenterECEF.equals(
        first.skyFrame.ellipsoidCenterECEF
      )
    ).toBe(true);
    expect(second.directionToSun.equals(first.directionToSun)).toBe(false);
  });

  it("rejects malformed atmosphere units and matrices", () => {
    const instant = new Date("2026-06-21T10:00:00.000Z");
    expect(
      getAtmosphericInputValidationError(instant, {
        ...WUPPERTAL,
        latitude: Number.NaN,
      })
    ).toContain("latitude");
    expect(
      getAtmosphericInputValidationError(instant, WUPPERTAL, {
        observer: { ...WUPPERTAL, altitudeMeters: 0 },
        scenePosition: new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0),
      })
    ).toContain("scenePosition");

    const validFrame = evaluateAtmosphericSkyFrame(instant, WUPPERTAL);
    expect(getAtmosphericSkyFrameValidationError(validFrame)).toBeNull();
    const malformedMatrix = validFrame.ecefToSceneMatrix.clone();
    malformedMatrix.elements[0] *= 2;
    expect(
      getAtmosphericSkyFrameValidationError({
        ...validFrame,
        ecefToSceneMatrix: malformedMatrix,
      })
    ).toContain("orthonormal");

    const sample = evaluateAtmosphericSunlight(instant, WUPPERTAL, null);
    expect(getAtmosphericSunlightSampleValidationError(sample)).toBeNull();
    expect(
      getAtmosphericSunlightSampleValidationError({
        ...sample,
        relativeIntensity: Number.NaN,
      })
    ).toContain("invalid values");
  });

  it("moves the local sky ellipsoid with its zero-altitude map anchor", () => {
    const instant = new Date("2026-06-21T10:00:00.000Z");
    const observer = {
      ...WUPPERTAL,
      altitudeMeters: 420,
    };
    const referenceObserver = {
      ...WUPPERTAL,
      altitudeMeters: 0,
    };
    const firstPosition = new THREE.Vector3(80, 0, -120);
    const secondPosition = new THREE.Vector3(200, 0, -360);
    const first = evaluateAtmosphericSkyFrame(instant, observer, {
      observer: referenceObserver,
      scenePosition: firstPosition,
    });
    const second = evaluateAtmosphericSkyFrame(instant, observer, {
      observer: referenceObserver,
      scenePosition: secondPosition,
    });

    expect(second.ecefToSceneMatrix.equals(first.ecefToSceneMatrix)).toBe(true);
    const sceneCenterDelta = second.ellipsoidCenterECEF
      .clone()
      .sub(first.ellipsoidCenterECEF)
      .applyMatrix4(second.ecefToSceneMatrix);
    expect(
      sceneCenterDelta.distanceTo(secondPosition.sub(firstPosition))
    ).toBeLessThan(1e-8);
  });

  it("orients Takram sky irradiance in the local East/Up/South frame", () => {
    const irradianceTexture = createConstantTexture(
      IRRADIANCE_TEXTURE_WIDTH,
      IRRADIANCE_TEXTURE_HEIGHT
    );
    const skyLightProbe = new SkyLightProbe({
      irradianceTexture,
      ellipsoid: Ellipsoid.WGS84,
      correctAltitude: false,
      photometric: false,
    });

    const sample = evaluateAtmosphericSunlight(
      new Date("2026-06-21T10:00:00.000Z"),
      WUPPERTAL,
      null,
      skyLightProbe
    );

    expect(sample.atmosphericIrradianceReady).toBe(true);
    expect(sample.skyIrradianceCoefficients).toHaveLength(9);
    const coefficients = sample.skyIrradianceCoefficients ?? [];
    expect(coefficients[0]?.length()).toBeGreaterThan(0);
    expect(coefficients[1]?.length()).toBeGreaterThan(0);
    expect(coefficients[2]?.length()).toBeCloseTo(0, 10);
    expect(coefficients[3]?.length()).toBeCloseTo(0, 10);
    for (const coefficient of coefficients.slice(4)) {
      expect(coefficient.length()).toBeCloseTo(0, 12);
    }

    irradianceTexture.dispose();
  });

  it("loads LUTs independently and retries failed transmittance", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const evaluator = new AtmosphericSunlightEvaluator();
    const onReady = vi.fn();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    evaluator.ensure(onReady);

    expect(textureRequests).toMatchObject([
      {
        width: TRANSMITTANCE_TEXTURE_WIDTH,
        height: TRANSMITTANCE_TEXTURE_HEIGHT,
      },
      {
        width: IRRADIANCE_TEXTURE_WIDTH,
        height: IRRADIANCE_TEXTURE_HEIGHT,
      },
    ]);
    const firstTransmittanceRequest =
      findTextureRequests("transmittance.bin")[0];
    const irradianceRequest = findTextureRequests("irradiance.bin")[0];
    expect(firstTransmittanceRequest).toBeDefined();
    expect(irradianceRequest).toBeDefined();

    firstTransmittanceRequest?.onError?.(new Error("transmittance failed"));
    const irradianceTexture = createConstantTexture(
      IRRADIANCE_TEXTURE_WIDTH,
      IRRADIANCE_TEXTURE_HEIGHT
    );
    const irradianceDispose = vi.spyOn(irradianceTexture, "dispose");
    irradianceRequest?.onLoad(irradianceTexture);

    expect(onReady).toHaveBeenCalledTimes(1);
    let sample = evaluator.evaluate(
      new Date("2026-06-21T10:00:00.000Z"),
      WUPPERTAL
    );
    expect(sample.atmosphericTransmittanceReady).toBe(false);
    expect(sample.atmosphericIrradianceReady).toBe(true);
    expect(evaluator.ready).toBe(false);

    evaluator.ensure(onReady);
    expect(findTextureRequests("transmittance.bin")).toHaveLength(1);
    vi.advanceTimersByTime(30_000);
    evaluator.ensure(onReady);
    expect(findTextureRequests("irradiance.bin")).toHaveLength(1);
    expect(findTextureRequests("transmittance.bin")).toHaveLength(2);

    const transmittanceTexture = createConstantTexture(
      TRANSMITTANCE_TEXTURE_WIDTH,
      TRANSMITTANCE_TEXTURE_HEIGHT
    );
    const transmittanceDispose = vi.spyOn(transmittanceTexture, "dispose");
    findTextureRequests("transmittance.bin")[1]?.onLoad(transmittanceTexture);

    expect(onReady).toHaveBeenCalledTimes(2);
    sample = evaluator.evaluate(
      new Date("2026-06-21T10:00:00.000Z"),
      WUPPERTAL
    );
    expect(sample.atmosphericTransmittanceReady).toBe(true);
    expect(sample.atmosphericIrradianceReady).toBe(true);
    expect(sample.skyIrradianceCoefficients).toHaveLength(9);
    expect(evaluator.ready).toBe(true);

    evaluator.dispose();
    evaluator.dispose();
    expect(transmittanceDispose).toHaveBeenCalledTimes(1);
    expect(irradianceDispose).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("loads and shares all three LUTs needed by the sky material", () => {
    const evaluator = new AtmosphericSunlightEvaluator();
    const onReady = vi.fn();

    evaluator.ensureSky(onReady);

    expect(textureRequests).toMatchObject([
      {
        width: TRANSMITTANCE_TEXTURE_WIDTH,
        height: TRANSMITTANCE_TEXTURE_HEIGHT,
      },
      {
        width: IRRADIANCE_TEXTURE_WIDTH,
        height: IRRADIANCE_TEXTURE_HEIGHT,
      },
      {
        width: SCATTERING_TEXTURE_WIDTH,
        height: SCATTERING_TEXTURE_HEIGHT,
        depth: SCATTERING_TEXTURE_DEPTH,
      },
    ]);
    const transmittanceTexture = createConstantTexture(
      TRANSMITTANCE_TEXTURE_WIDTH,
      TRANSMITTANCE_TEXTURE_HEIGHT
    );
    const irradianceTexture = createConstantTexture(
      IRRADIANCE_TEXTURE_WIDTH,
      IRRADIANCE_TEXTURE_HEIGHT
    );
    const scatteringTexture = createConstant3DTexture(
      SCATTERING_TEXTURE_WIDTH,
      SCATTERING_TEXTURE_HEIGHT,
      SCATTERING_TEXTURE_DEPTH
    );
    findTextureRequests("transmittance.bin")[0]?.onLoad(transmittanceTexture);
    findTextureRequests("irradiance.bin")[0]?.onLoad(irradianceTexture);
    expect(onReady).not.toHaveBeenCalled();
    findTextureRequests("scattering.bin")[0]?.onLoad(scatteringTexture);

    expect(onReady).toHaveBeenCalledOnce();
    expect(evaluator.skyReady).toBe(true);
    expect(evaluator.skyTextures).toEqual({
      transmittanceTexture,
      irradianceTexture,
      scatteringTexture,
    });

    evaluator.dispose();
  });

  it("retries failed irradiance without reloading transmittance", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const evaluator = new AtmosphericSunlightEvaluator();
    const onReady = vi.fn();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    evaluator.ensure(onReady);

    const transmittanceTexture = createConstantTexture(
      TRANSMITTANCE_TEXTURE_WIDTH,
      TRANSMITTANCE_TEXTURE_HEIGHT
    );
    findTextureRequests("transmittance.bin")[0]?.onLoad(transmittanceTexture);
    findTextureRequests("irradiance.bin")[0]?.onError?.(
      new Error("irradiance failed")
    );

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(
      evaluator.evaluate(new Date("2026-06-21T10:00:00.000Z"), WUPPERTAL)
        .atmosphericIrradianceReady
    ).toBe(false);
    evaluator.ensure(onReady);
    expect(findTextureRequests("transmittance.bin")).toHaveLength(1);
    expect(findTextureRequests("irradiance.bin")).toHaveLength(1);
    vi.advanceTimersByTime(30_000);
    evaluator.ensure(onReady);
    expect(findTextureRequests("irradiance.bin")).toHaveLength(2);

    const irradianceTexture = createConstantTexture(
      IRRADIANCE_TEXTURE_WIDTH,
      IRRADIANCE_TEXTURE_HEIGHT
    );
    findTextureRequests("irradiance.bin")[1]?.onLoad(irradianceTexture);
    expect(onReady).toHaveBeenCalledTimes(2);
    expect(evaluator.ready).toBe(true);

    evaluator.dispose();
    errorSpy.mockRestore();
  });

  it("disposes late texture results without publishing readiness", () => {
    const evaluator = new AtmosphericSunlightEvaluator();
    const onReady = vi.fn();
    evaluator.ensure(onReady);
    evaluator.dispose();

    const transmittanceTexture = createConstantTexture(
      TRANSMITTANCE_TEXTURE_WIDTH,
      TRANSMITTANCE_TEXTURE_HEIGHT
    );
    const irradianceTexture = createConstantTexture(
      IRRADIANCE_TEXTURE_WIDTH,
      IRRADIANCE_TEXTURE_HEIGHT
    );
    const transmittanceDispose = vi.spyOn(transmittanceTexture, "dispose");
    const irradianceDispose = vi.spyOn(irradianceTexture, "dispose");
    findTextureRequests("transmittance.bin")[0]?.onLoad(transmittanceTexture);
    findTextureRequests("irradiance.bin")[0]?.onLoad(irradianceTexture);

    expect(onReady).not.toHaveBeenCalled();
    expect(evaluator.ready).toBe(false);
    expect(transmittanceDispose).toHaveBeenCalledTimes(1);
    expect(irradianceDispose).toHaveBeenCalledTimes(1);
    const requestCount = textureRequests.length;
    evaluator.ensure(onReady);
    expect(textureRequests).toHaveLength(requestCount);
  });
});
