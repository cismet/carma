import {
  DEFAULT_PRECOMPUTED_TEXTURES_URL,
  getSunDirectionECEF,
  getSunLightColor,
  IRRADIANCE_TEXTURE_HEIGHT,
  IRRADIANCE_TEXTURE_WIDTH,
  SCATTERING_TEXTURE_DEPTH,
  SCATTERING_TEXTURE_HEIGHT,
  SCATTERING_TEXTURE_WIDTH,
  SkyLightProbe,
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH,
} from "@takram/three-atmosphere";
import {
  createData3DTextureLoader,
  createDataTextureLoader,
  Ellipsoid,
  Geodetic,
  parseFloat16Array,
  radians,
} from "@takram/three-geospatial";
import * as THREE from "three";

import { clamp } from "@carma-commons/math";
import { radToDegNumeric } from "@carma-units";

const FALLBACK_SUN_COLOR = new THREE.Color("#fff2d8");
const MIN_RADIANCE = 1e-8;
const LUT_RETRY_DELAY_MS = 30_000;

export type AtmosphericSunlightSample = Readonly<{
  directionToSun: THREE.Vector3;
  color: THREE.Color;
  relativeIntensity: number;
  radiance: THREE.Color;
  atmosphericTransmittanceReady: boolean;
  atmosphericIrradianceReady: boolean;
  skyIrradianceCoefficients: readonly THREE.Vector3[] | null;
  azimuthDegrees: number;
  elevationDegrees: number;
  skyFrame: AtmosphericSkyFrame;
}>;

export type AtmosphericSkyFrame = Readonly<{
  directionToSunECEF: THREE.Vector3;
  ecefToSceneMatrix: THREE.Matrix4;
  observerECEF: THREE.Vector3;
}>;

export type AtmosphericSkyTextures = Readonly<{
  irradianceTexture: THREE.DataTexture;
  scatteringTexture: THREE.Data3DTexture;
  transmittanceTexture: THREE.DataTexture;
}>;

export type AtmosphericObserver = Readonly<{
  longitude: number;
  latitude: number;
  altitudeMeters: number;
}>;

export type AtmosphericSunlightOptions = Readonly<{
  useTransmittanceLut: boolean;
  useIrradianceLut: boolean;
}>;

const DEFAULT_ATMOSPHERIC_SUNLIGHT_OPTIONS: AtmosphericSunlightOptions = {
  useTransmittanceLut: true,
  useIrradianceLut: true,
};

type ObserverFrame = ReturnType<typeof getObserverFrame>;

const getEcefToSceneMatrix = ({ east, north, up }: ObserverFrame) =>
  new THREE.Matrix4().set(
    east.x,
    east.y,
    east.z,
    0,
    up.x,
    up.y,
    up.z,
    0,
    -north.x,
    -north.y,
    -north.z,
    0,
    0,
    0,
    0,
    1
  );

function getObserverFrame({
  longitude,
  latitude,
  altitudeMeters,
}: AtmosphericObserver) {
  const observerECEF = new Geodetic(
    radians(longitude),
    radians(latitude),
    altitudeMeters
  ).toECEF();
  const east = new THREE.Vector3();
  const north = new THREE.Vector3();
  const up = new THREE.Vector3();
  Ellipsoid.WGS84.getEastNorthUpVectors(observerECEF, east, north, up);
  return { observerECEF, east, north, up };
}

const ecefDirectionToSceneDirectionWithFrame = (
  directionECEF: THREE.Vector3,
  { east, north, up }: ObserverFrame,
  target: THREE.Vector3
): THREE.Vector3 =>
  target
    .set(
      directionECEF.dot(east),
      directionECEF.dot(up),
      -directionECEF.dot(north)
    )
    .normalize();

/** Convert a Takram ECEF direction into the shared scene's E/U/S axes. */
export const ecefDirectionToSceneDirection = (
  directionECEF: THREE.Vector3,
  observer: AtmosphericObserver,
  target = new THREE.Vector3()
): THREE.Vector3 => {
  return ecefDirectionToSceneDirectionWithFrame(
    directionECEF,
    getObserverFrame(observer),
    target
  );
};

const evaluateSkyIrradiance = (
  skyLightProbe: SkyLightProbe | null,
  sunDirectionECEF: THREE.Vector3,
  { observerECEF, east, north, up }: ObserverFrame
): readonly THREE.Vector3[] | null => {
  if (!skyLightProbe?.irradianceTexture) return null;

  // SkyLightProbe treats ellipsoidMatrix as ECEF-to-world orientation and
  // ellipsoidCenter as the ECEF offset subtracted after that inverse transform.
  // This rotation maps ECEF into the shared local +East/+Up/-North scene frame;
  // negating the observer position makes the probe's local origin evaluate at
  // the observer without putting translation into the normal transform.
  skyLightProbe.ellipsoidMatrix.set(
    east.x,
    east.y,
    east.z,
    0,
    up.x,
    up.y,
    up.z,
    0,
    -north.x,
    -north.y,
    -north.z,
    0,
    0,
    0,
    0,
    1
  );
  skyLightProbe.ellipsoidCenter.copy(observerECEF).negate();
  skyLightProbe.sunDirection.copy(sunDirectionECEF);
  skyLightProbe.position.set(0, 0, 0);
  skyLightProbe.updateMatrixWorld(true);
  skyLightProbe.update();
  return skyLightProbe.sh.coefficients.map((coefficient) =>
    coefficient.clone()
  );
};

const getSceneAngles = (direction: THREE.Vector3) => {
  const elevationDegrees = radToDegNumeric(
    Math.asin(clamp(direction.y, -1, 1))
  );
  const azimuthDegrees =
    (radToDegNumeric(Math.atan2(direction.x, -direction.z)) + 360) % 360;
  return { azimuthDegrees, elevationDegrees };
};

export const evaluateAtmosphericSunlight = (
  instant: Date,
  observer: AtmosphericObserver,
  transmittanceTexture: THREE.DataTexture | null,
  skyLightProbe: SkyLightProbe | null = null
): AtmosphericSunlightSample => {
  const observerFrame = getObserverFrame(observer);
  const { observerECEF, up } = observerFrame;
  const sunDirectionECEF = getSunDirectionECEF(instant, new THREE.Vector3());
  const skyFrame: AtmosphericSkyFrame = {
    directionToSunECEF: sunDirectionECEF.clone(),
    ecefToSceneMatrix: getEcefToSceneMatrix(observerFrame),
    observerECEF: observerECEF.clone(),
  };
  const directionToSun = ecefDirectionToSceneDirectionWithFrame(
    sunDirectionECEF,
    observerFrame,
    new THREE.Vector3()
  );
  const skyIrradianceCoefficients = evaluateSkyIrradiance(
    skyLightProbe,
    sunDirectionECEF,
    observerFrame
  );
  const { azimuthDegrees, elevationDegrees } = getSceneAngles(directionToSun);
  if (!transmittanceTexture) {
    const relativeIntensity = Math.sqrt(clamp(directionToSun.y, 0, 1));
    return {
      directionToSun,
      color: FALLBACK_SUN_COLOR.clone(),
      relativeIntensity,
      radiance: FALLBACK_SUN_COLOR.clone().multiplyScalar(relativeIntensity),
      atmosphericTransmittanceReady: false,
      atmosphericIrradianceReady: skyIrradianceCoefficients !== null,
      skyIrradianceCoefficients,
      azimuthDegrees,
      elevationDegrees,
      skyFrame,
    };
  }

  const radiance = getSunLightColor(
    transmittanceTexture,
    observerECEF,
    sunDirectionECEF,
    new THREE.Color(),
    {
      ellipsoid: Ellipsoid.WGS84,
      correctAltitude: true,
      photometric: true,
    }
  );
  const zenithRadiance = getSunLightColor(
    transmittanceTexture,
    observerECEF,
    up,
    new THREE.Color(),
    {
      ellipsoid: Ellipsoid.WGS84,
      correctAltitude: true,
      photometric: true,
    }
  );
  const radiancePeak = Math.max(radiance.r, radiance.g, radiance.b, 0);
  const zenithPeak = Math.max(
    zenithRadiance.r,
    zenithRadiance.g,
    zenithRadiance.b,
    MIN_RADIANCE
  );
  const color =
    radiancePeak > MIN_RADIANCE
      ? radiance.clone().multiplyScalar(1 / radiancePeak)
      : new THREE.Color(0, 0, 0);
  return {
    directionToSun,
    color,
    relativeIntensity: clamp(radiancePeak / zenithPeak, 0, 1),
    radiance,
    atmosphericTransmittanceReady: true,
    atmosphericIrradianceReady: skyIrradianceCoefficients !== null,
    skyIrradianceCoefficients,
    azimuthDegrees,
    elevationDegrees,
    skyFrame,
  };
};

/**
 * Owns Takram's CPU-readable direct-light and sky-irradiance LUTs. Per-time
 * evaluation is synchronous and never reads back the shared MapLibre framebuffer.
 */
export class AtmosphericSunlightEvaluator {
  private transmittanceTexture: THREE.DataTexture | null = null;
  private irradianceTexture: THREE.DataTexture | null = null;
  private scatteringTexture: THREE.Data3DTexture | null = null;
  private readonly skyLightProbe = new SkyLightProbe({
    ellipsoid: Ellipsoid.WGS84,
    correctAltitude: true,
    photometric: true,
  });
  private transmittanceLoading = false;
  private irradianceLoading = false;
  private scatteringLoading = false;
  private transmittanceRetryAt = 0;
  private irradianceRetryAt = 0;
  private scatteringRetryAt = 0;
  private disposed = false;

  get ready(): boolean {
    return (
      this.transmittanceTexture !== null && this.irradianceTexture !== null
    );
  }

  get skyReady(): boolean {
    return this.skyTextures !== null;
  }

  get skyTextures(): AtmosphericSkyTextures | null {
    if (
      !this.transmittanceTexture ||
      !this.irradianceTexture ||
      !this.scatteringTexture
    ) {
      return null;
    }
    return {
      transmittanceTexture: this.transmittanceTexture,
      irradianceTexture: this.irradianceTexture,
      scatteringTexture: this.scatteringTexture,
    };
  }

  get isSkyLoading(): boolean {
    return (
      this.transmittanceLoading ||
      this.irradianceLoading ||
      this.scatteringLoading
    );
  }

  isLoadingFor(
    options: AtmosphericSunlightOptions = DEFAULT_ATMOSPHERIC_SUNLIGHT_OPTIONS
  ): boolean {
    return (
      (options.useTransmittanceLut && this.transmittanceLoading) ||
      (options.useIrradianceLut && this.irradianceLoading)
    );
  }

  ensure(
    onReady: () => void,
    options: AtmosphericSunlightOptions = DEFAULT_ATMOSPHERIC_SUNLIGHT_OPTIONS
  ): void {
    if (this.disposed) return;
    const notifyWhenSettled = () => {
      if (!this.isLoadingFor(options)) onReady();
    };
    if (options.useTransmittanceLut) {
      this.ensureTransmittance(notifyWhenSettled);
    }
    if (options.useIrradianceLut) this.ensureIrradiance(notifyWhenSettled);
  }

  ensureSky(onReady: () => void): void {
    if (this.disposed || this.skyReady) return;
    let notified = false;
    const notifyWhenSettled = () => {
      if (!notified && !this.isSkyLoading) {
        notified = true;
        onReady();
      }
    };
    this.ensureTransmittance(notifyWhenSettled);
    this.ensureIrradiance(notifyWhenSettled);
    this.ensureScattering(notifyWhenSettled);
  }

  private ensureTransmittance(onReady: () => void): void {
    if (
      this.transmittanceTexture ||
      this.transmittanceLoading ||
      Date.now() < this.transmittanceRetryAt
    ) {
      return;
    }
    this.transmittanceLoading = true;
    createDataTextureLoader(parseFloat16Array, {
      width: TRANSMITTANCE_TEXTURE_WIDTH,
      height: TRANSMITTANCE_TEXTURE_HEIGHT,
    }).load(
      `${DEFAULT_PRECOMPUTED_TEXTURES_URL}/transmittance.bin`,
      (transmittanceTexture) => {
        this.transmittanceLoading = false;
        if (this.disposed) {
          transmittanceTexture.dispose();
          return;
        }
        this.transmittanceRetryAt = 0;
        this.transmittanceTexture = transmittanceTexture;
        onReady();
      },
      undefined,
      (error: unknown) => {
        this.transmittanceLoading = false;
        if (!this.disposed) {
          this.transmittanceRetryAt = Date.now() + LUT_RETRY_DELAY_MS;
          console.error("[SHADOW] Takram transmittance LUT failed", error);
          onReady();
        }
      }
    );
  }

  private ensureIrradiance(onReady: () => void): void {
    if (
      this.irradianceTexture ||
      this.irradianceLoading ||
      Date.now() < this.irradianceRetryAt
    ) {
      return;
    }
    this.irradianceLoading = true;
    createDataTextureLoader(parseFloat16Array, {
      width: IRRADIANCE_TEXTURE_WIDTH,
      height: IRRADIANCE_TEXTURE_HEIGHT,
    }).load(
      `${DEFAULT_PRECOMPUTED_TEXTURES_URL}/irradiance.bin`,
      (irradianceTexture) => {
        this.irradianceLoading = false;
        if (this.disposed) {
          irradianceTexture.dispose();
          return;
        }
        this.irradianceRetryAt = 0;
        this.irradianceTexture = irradianceTexture;
        this.skyLightProbe.irradianceTexture = irradianceTexture;
        onReady();
      },
      undefined,
      (error: unknown) => {
        this.irradianceLoading = false;
        if (!this.disposed) {
          this.irradianceRetryAt = Date.now() + LUT_RETRY_DELAY_MS;
          console.error("[SHADOW] Takram irradiance LUT failed", error);
          onReady();
        }
      }
    );
  }

  private ensureScattering(onReady: () => void): void {
    if (
      this.scatteringTexture ||
      this.scatteringLoading ||
      Date.now() < this.scatteringRetryAt
    ) {
      return;
    }
    this.scatteringLoading = true;
    createData3DTextureLoader(parseFloat16Array, {
      width: SCATTERING_TEXTURE_WIDTH,
      height: SCATTERING_TEXTURE_HEIGHT,
      depth: SCATTERING_TEXTURE_DEPTH,
    }).load(
      `${DEFAULT_PRECOMPUTED_TEXTURES_URL}/scattering.bin`,
      (scatteringTexture) => {
        this.scatteringLoading = false;
        if (this.disposed) {
          scatteringTexture.dispose();
          return;
        }
        this.scatteringRetryAt = 0;
        this.scatteringTexture = scatteringTexture;
        onReady();
      },
      undefined,
      (error: unknown) => {
        this.scatteringLoading = false;
        if (!this.disposed) {
          this.scatteringRetryAt = Date.now() + LUT_RETRY_DELAY_MS;
          console.error("[SHADOW] Takram scattering LUT failed", error);
          onReady();
        }
      }
    );
  }

  evaluate(
    instant: Date,
    observer: AtmosphericObserver,
    options: AtmosphericSunlightOptions = DEFAULT_ATMOSPHERIC_SUNLIGHT_OPTIONS
  ): AtmosphericSunlightSample {
    return evaluateAtmosphericSunlight(
      instant,
      observer,
      options.useTransmittanceLut ? this.transmittanceTexture : null,
      options.useIrradianceLut ? this.skyLightProbe : null
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.transmittanceLoading = false;
    this.irradianceLoading = false;
    this.scatteringLoading = false;
    this.transmittanceRetryAt = 0;
    this.irradianceRetryAt = 0;
    this.scatteringRetryAt = 0;
    this.transmittanceTexture?.dispose();
    this.irradianceTexture?.dispose();
    this.scatteringTexture?.dispose();
    this.transmittanceTexture = null;
    this.irradianceTexture = null;
    this.scatteringTexture = null;
    this.skyLightProbe.irradianceTexture = null;
    this.skyLightProbe.sh.zero();
  }
}
