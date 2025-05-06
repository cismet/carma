import { useCallback, useRef, useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { debounce } from "lodash";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRotateLeft,
  faRotateRight,
  faSpinner,
  faExternalLink,
  faFileArrowDown,
  faMagic,
} from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";
import {
  HeadingPitchRange,
  Math as CesiumMath,
  Cartesian3,
  Cartographic,
  Matrix4,
  EasingFunction,
  Entity,
  Color,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  ConstantPositionProperty,
  sampleTerrainMostDetailed,
  Transforms,
} from "cesium";

import {
  selectViewerIsMode2d,
  selectViewerIsTransitioning,
  useCesiumContext,
} from "@carma-mapping/cesium-engine";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { useFeatureFlags } from "@carma-apps/portals";

import { ObliqueFootprintLayer } from "./ObliqueFootprintLayer";
import { ObliqueDebugSvg } from "./debugUI/ObliqueDebugSvg";
import { ObliqueImagePreview } from "./ObliqueImagePreview";
import { ObliqueImageInfo } from "./debugUI/ObliqueImageInfo";

import { getObliqueMode, setObliqueMode } from "../../store/slices/ui";

import { useObliqueDataContext } from "../hooks/useObliqueDataContext";
import { useOrbitPoint } from "../hooks/useOrbitPoint";

import { resetCamera, flyToImprovedOrientation } from "../utils/cameraUtils";
import { downloadAsBlobAsync } from "../utils/downloads";
import { formatHeadingDegrees } from "../utils/formatters";
import {
  CardinalDirectionEnum,
  findClosestCardinalIndex,
  getCardinalHeadings,
  getDirectionFromCartesian,
} from "../utils/orientationUtils";
import { getPreviewImageUrl } from "../utils/imageHandling";
import {
  subscribeToPreviewVisibility,
  notifyPreviewVisibilityChange,
} from "../utils/previewVisibility";

import { OBLIQUE_PREVIEW_QUALITY } from "../constants";
import { Vector3Arr } from "types/math";
import { CameraVectorControls } from "./debugUI/CameraVectorControls";
import { ExteriorOrientationRecord } from "../types";
import { mapExtOriArrToRecord } from "../utils/obliqueImageRecord";

type ObliqueControlsProps = {
  /**
   * Offset angle in radians to apply to all cardinal directions.
   * For example, Math.PI/12 (15 degrees) will rotate all directions clockwise.
   * This allows for aligning the cardinal directions with specific features.
   */
  headingOffset?: number;
  isObliqueMode?: boolean;
};

const DEFAULT_UTM_GRID_CONVERGENCE_ANGLE = 1.52;
// Default angle for UTM grid convergence good baseline for most cases within Local wuppertal Extent, but should be calculated for each image from the UTM coordinates

export const ObliqueControls: React.FC<ObliqueControlsProps> = () => {
  const isObliqueMode = useSelector(getObliqueMode);
  const dispatch = useDispatch();
  const {
    headingOffset,
    nearestImage,
    isAllDataReady,
    previewPath,
    previewQualityLevel,
    setLockFootprint,
    exteriorOrientations,
  } = useObliqueDataContext();
  const { viewerRef, terrainProviderRef } = useCesiumContext();
  const flags = useFeatureFlags();
  const isDebugMode = flags.featureFlagDebugOblique;
  const animationInProgressRef = useRef<boolean>(false);
  const [activeDirection, setActiveDirection] =
    useState<CardinalDirectionEnum | null>(null);
  const [isVisible, setIsVisible] = useState(isObliqueMode);
  const [shouldRender, setShouldRender] = useState(isObliqueMode);
  const [currentHeading, setCurrentHeading] = useState<number>(0);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const isMode2d = useSelector(selectViewerIsMode2d);
  const isTransitioning = useSelector(selectViewerIsTransitioning);
  const orbitPointEntityRef = useRef<Entity | null>(null);
  const userMovedCameraRef = useRef<boolean>(false);
  const preloadImageRef = useRef<ReturnType<typeof debounce> | null>(null);

  const orbitPoint = useOrbitPoint();

  const previewUrl = nearestImage
    ? getPreviewImageUrl(
        previewPath,
        previewQualityLevel,
        nearestImage.record.id
      )
    : null;

  const downloadUrl = nearestImage
    ? getPreviewImageUrl(
        previewPath,
        OBLIQUE_PREVIEW_QUALITY.LEVEL_2,
        nearestImage.record.id
      )
    : null;

  const [photoMatch, setPhotoMatch] =
    useState<ExteriorOrientationRecord | null>(null);
  const [directionVectorECEF, setDirectionVectorECEF] = useState<Vector3Arr>([
    0, 0, -1,
  ]);
  const [upVector, setUpVector] = useState<Vector3Arr>([0, 1, 0]);
  const [directionVectorLocal, setDirectionVectorLocal] = useState<Vector3Arr>([
    0, 0, 0,
  ]);
  const [baseENUDirection, setBaseENUDirection] = useState<Vector3Arr | null>(
    null
  );
  // Additional states for transformation visualization
  const [directionENUinUTM, setDirectionENUinUTM] = useState<Vector3Arr | null>(
    null
  );

  // State for rotation angle
  const [rotationAngle, setRotationAngle] = useState<number>(
    DEFAULT_UTM_GRID_CONVERGENCE_ANGLE
  );

  // State for transformation matrices
  const transformMatrixRef = useRef<{
    localToFixed: Matrix4 | null;
    fixedToLocal: Matrix4 | null;
    lastPosition: Cartesian3 | null;
  }>({ localToFixed: null, fixedToLocal: null, lastPosition: null });

  const isInitializedRef = useRef(false);

  // Handle visibility changes when oblique mode toggles
  useEffect(() => {
    if (isObliqueMode) {
      setShouldRender(true);
      setTimeout(() => setIsVisible(true), 10);
    } else {
      setIsVisible(false);
      const timeout = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timeout);
    }
  }, [isObliqueMode]);

  useEffect(() => {
    if (isTransitioning && !isMode2d && viewerRef.current) {
      console.debug(
        "ObliqueControls: Transitioning to 2D mode disabling oblique mode"
      );
      dispatch(setObliqueMode(false));
      viewerRef.current.scene.requestRender();
    }
  }, [isTransitioning, isMode2d, viewerRef, dispatch]);

  // Subscribe to preview visibility changes from outside this component
  useEffect(() => {
    // Update our local state when preview visibility changes elsewhere
    const unsubscribe = subscribeToPreviewVisibility((visible) => {
      setIsPreviewVisible(visible);
    });

    return unsubscribe;
  }, []);

  // Create or update the orbit point entity
  const updateOrbitPointEntity = useCallback(() => {
    if (viewerRef.current || !orbitPoint || !isDebugMode) {
      if (orbitPointEntityRef.current) {
        viewerRef.current.entities.remove(orbitPointEntityRef.current);
        orbitPointEntityRef.current = null;
      }
      return;
    }
    if (!orbitPointEntityRef.current) {
      orbitPointEntityRef.current = viewerRef.current.entities.add({
        position: new ConstantPositionProperty(orbitPoint),
        point: {
          pixelSize: 10,
          color: Color.YELLOW,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    } else {
      orbitPointEntityRef.current.position = new ConstantPositionProperty(
        orbitPoint
      );
    }
  }, [viewerRef, isDebugMode, orbitPoint]);

  // Remove orbit point entity when component unmounts
  useEffect(() => {
    const currentOrbitPointEntity = orbitPointEntityRef.current;
    const viewer = viewerRef.current;

    return () => {
      if (viewer && currentOrbitPointEntity) {
        viewer.entities.remove(currentOrbitPointEntity);
      }
    };
  }, [viewerRef]);

  const flyToNearestImage = useCallback(async () => {
    if (isPreviewVisible) {
      setIsPreviewVisible(false);
      notifyPreviewVisibilityChange(false);
      return;
    }

    const viewer = viewerRef.current;

    if (!viewer || !nearestImage) return;

    const { centerWGS84 } = nearestImage.record;
    const { imageCenter } = nearestImage;
    if (!centerWGS84 || !imageCenter) return;

    const [longitude, latitude, height] = centerWGS84;
    const position = Cartesian3.fromDegrees(longitude, latitude, height);
    const imageCenterCartesian = Cartesian3.fromDegrees(
      imageCenter.longitude,
      imageCenter.latitude
    );

    const imageCenterCartograpic =
      Cartographic.fromCartesian(imageCenterCartesian);
    const [centerWithHeight] = await sampleTerrainMostDetailed(
      terrainProviderRef.current,
      [imageCenterCartograpic]
    );

    const centerWithHeightCartesian =
      Cartographic.toCartesian(centerWithHeight);

    const direction = getDirectionFromCartesian(
      position,
      centerWithHeightCartesian
    );

    // local UP
    const up = Cartesian3.normalize(position, new Cartesian3());

    setLockFootprint(true);

    const currentDistanceToCamera = Cartesian3.distance(
      viewer.camera.positionWC,
      position
    );

    const duration = Math.max(
      0.05,
      Math.min(3, Math.sqrt(Math.abs(currentDistanceToCamera)) / 10)
    ); // seconds

    viewer.camera.flyTo({
      destination: position,
      orientation: { direction, up },
      endTransform: Matrix4.IDENTITY,
      duration,
      complete: () => {
        animationInProgressRef.current = false;
        setIsPreviewVisible(true);
        notifyPreviewVisibilityChange(true);
      },
    });
  }, [
    viewerRef,
    terrainProviderRef,
    nearestImage,
    isPreviewVisible,
    setLockFootprint,
  ]);

  // Function to fly to improved orientation based on CameraVectorControls data
  const flyToImprovedCameraOrientation = useCallback(() => {
    if (isPreviewVisible) {
      setIsPreviewVisible(false);
      notifyPreviewVisibilityChange(false);
      return;
    }

    const viewer = viewerRef.current;
    if (!viewer || !nearestImage) return;

    // Set lock on footprint during flight
    setLockFootprint(true);
    animationInProgressRef.current = true;

    // Use the utility function to perform the flight with improved orientation
    flyToImprovedOrientation(viewer, nearestImage, () => {
      animationInProgressRef.current = false;
      setIsPreviewVisible(true);
      notifyPreviewVisibilityChange(true);
    });
  }, [viewerRef, nearestImage, isPreviewVisible, setLockFootprint]);

  const openImageLink = useCallback(() => {
    window.open(downloadUrl, "_blank");
  }, [downloadUrl]);

  const handleDirectDownload = useCallback(
    () => downloadAsBlobAsync(downloadUrl),
    [downloadUrl]
  );

  // Update current heading and set up camera movement detection
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !isObliqueMode) return;

    const camera = viewer.camera;

    setCurrentHeading(camera.heading);

    // Set up event handlers to detect when the user moves the camera manually
    const inputHandler = new ScreenSpaceEventHandler(viewer.canvas);

    // Track when the user starts manipulating the camera
    inputHandler.setInputAction(() => {
      if (!animationInProgressRef.current) {
        userMovedCameraRef.current = true;
      }
    }, ScreenSpaceEventType.LEFT_DOWN);

    inputHandler.setInputAction(() => {
      if (!animationInProgressRef.current) {
        userMovedCameraRef.current = true;
      }
    }, ScreenSpaceEventType.MIDDLE_DOWN);

    inputHandler.setInputAction(() => {
      if (!animationInProgressRef.current) {
        userMovedCameraRef.current = true;
      }
    }, ScreenSpaceEventType.RIGHT_DOWN);

    const updateCameraInfo = () => {
      setCurrentHeading(camera.heading);

      if (animationInProgressRef.current) {
        return; // Don't process further if we're in the middle of an animation
      }

      if (userMovedCameraRef.current) {
        updateOrbitPointEntity();
        userMovedCameraRef.current = false;
      }

      const cardinalHeadings = getCardinalHeadings(headingOffset);
      const closestCardinalIndex = findClosestCardinalIndex(
        camera.heading,
        cardinalHeadings
      );
      setActiveDirection(closestCardinalIndex);
    };

    if (!orbitPoint && isDebugMode) {
      updateOrbitPointEntity();
    }

    const cardinalHeadings = getCardinalHeadings(headingOffset);
    const closestCardinalIndex = findClosestCardinalIndex(
      camera.heading,
      cardinalHeadings
    );
    setActiveDirection(closestCardinalIndex);

    viewer.camera.changed.addEventListener(updateCameraInfo);
    viewer.camera.moveEnd.addEventListener(updateCameraInfo);

    return () => {
      viewer.camera.changed.removeEventListener(updateCameraInfo);
      viewer.camera.moveEnd.removeEventListener(updateCameraInfo);
      inputHandler.destroy();
    };
  }, [
    viewerRef,
    isObliqueMode,
    headingOffset,
    updateOrbitPointEntity,
    isDebugMode,
    orbitPoint,
  ]);

  useEffect(() => {
    if (preloadImageRef.current) {
      preloadImageRef.current.cancel();
    }
    preloadImageRef.current = debounce(() => {
      const img = new window.Image();
      img.src = previewUrl;
    }, 500);
    preloadImageRef.current();
    return () => {
      if (preloadImageRef.current) {
        preloadImageRef.current.cancel();
      }
    };
  }, [previewUrl]);

  const rotateToDirection = useCallback(
    (targetDirection: CardinalDirectionEnum) => {
      const viewer = viewerRef.current;
      if (!viewer || animationInProgressRef.current) return;

      const camera = viewer.camera;
      const scene = viewer.scene;
      const currentHeading = camera.heading;

      const cardinalHeadings = getCardinalHeadings(headingOffset);

      if (
        Math.abs(currentHeading - cardinalHeadings[targetDirection]) < 0.0001
      ) {
        return;
      }

      const targetHeading = cardinalHeadings[targetDirection];

      if (!orbitPoint && isDebugMode) {
        updateOrbitPointEntity();
      }

      // Calculate the range (distance from center)
      const range = Cartesian3.distance(orbitPoint, camera.position);

      // Start the animation
      animationInProgressRef.current = true;
      userMovedCameraRef.current = false; // Reset this flag since we're starting a programmatic move

      let startTime = Date.now();
      const duration = 500; // ms

      let headingChange = targetHeading - currentHeading;

      // Ensure we take the shortest path
      if (headingChange > Math.PI) {
        headingChange -= CesiumMath.TWO_PI;
      } else if (headingChange < -Math.PI) {
        headingChange += CesiumMath.TWO_PI;
      }

      // Skip animation if the change is very small
      if (Math.abs(headingChange) < 0.0001) {
        animationInProgressRef.current = false;
        return;
      }

      const onPreUpdate = () => {
        const currentTime = Date.now();
        let t = Math.min((currentTime - startTime) / duration, 1);
        t = EasingFunction.SINUSOIDAL_IN_OUT(t);

        if (t < 1) {
          const intermediateHeading = currentHeading + headingChange * t;

          camera.lookAt(
            orbitPoint,
            new HeadingPitchRange(intermediateHeading, camera.pitch, range)
          );

          setCurrentHeading(intermediateHeading);

          scene.requestRender();
        } else {
          camera.lookAt(
            orbitPoint,
            new HeadingPitchRange(targetHeading, camera.pitch, range)
          );

          setCurrentHeading(targetHeading);
          resetCamera(viewer);
          animationInProgressRef.current = false;
          userMovedCameraRef.current = true;

          scene.preUpdate.removeEventListener(onPreUpdate);
          setActiveDirection(targetDirection);
        }
      };
      scene.preUpdate.addEventListener(onPreUpdate);
      return () => {
        resetCamera(viewer);
        animationInProgressRef.current = false;
        userMovedCameraRef.current = true;
        scene.preUpdate.removeEventListener(onPreUpdate);
      };
    },
    [viewerRef, headingOffset, updateOrbitPointEntity, orbitPoint, isDebugMode]
  );

  const rotateCamera = useCallback(
    (clockwise: boolean) => {
      const viewer = viewerRef.current;
      if (!viewer || animationInProgressRef.current) return;

      const camera = viewer.camera;

      const cardinalHeadings = getCardinalHeadings(headingOffset);

      const closestCardinalIndex = findClosestCardinalIndex(
        camera.heading,
        cardinalHeadings
      );

      const nextCardinalIndex = clockwise
        ? (closestCardinalIndex + 1) % 4 // Next clockwise cardinal
        : (closestCardinalIndex + 3) % 4; // Next counterclockwise cardinal (4-1)

      rotateToDirection(nextCardinalIndex);
    },
    [viewerRef, headingOffset, rotateToDirection]
  );

  // Initialize ECEF vectors, transform, and local display
  useEffect(() => {
    if (viewerRef.current && viewerRef.current.camera) {
      console.log("Initializing ECEF vectors and local frame...");
      const camera = viewerRef.current.camera;
      const position = camera.position.clone();
      const direction = camera.direction.clone();
      const up = camera.up.clone();

      const initialDirECEF: Vector3Arr = [
        direction.x,
        direction.y,
        direction.z,
      ];
      const initialUp: Vector3Arr = [up.x, up.y, up.z];

      setDirectionVectorECEF(initialDirECEF);
      setUpVector(initialUp);

      const localToFixed = Transforms.eastNorthUpToFixedFrame(
        position,
        viewerRef.current.scene.globe.ellipsoid,
        new Matrix4()
      );
      const fixedToLocal = Matrix4.inverseTransformation(
        localToFixed,
        new Matrix4()
      );
      transformMatrixRef.current = {
        localToFixed,
        fixedToLocal,
        lastPosition: position,
      };

      const initialLocalDirection = Matrix4.multiplyByPointAsVector(
        fixedToLocal,
        direction,
        new Cartesian3()
      );
      setDirectionVectorLocal([
        initialLocalDirection.x,
        initialLocalDirection.y,
        initialLocalDirection.z,
      ]);

      setTimeout(() => {
        isInitializedRef.current = true;
      }, 0);
    }
  }, [viewerRef]);

  // Effect to store the base ENU direction when directionVectorLocal changes
  useEffect(() => {
    if (isInitializedRef.current && directionVectorLocal && !baseENUDirection) {
      setBaseENUDirection([...directionVectorLocal]);
    }
  }, [directionVectorLocal, baseENUDirection, isInitializedRef]);

  // Function to apply ECEF vectors to the camera
  const applyCameraVectors = useCallback(
    (ecefDirection: Vector3Arr, up: Vector3Arr) => {
      if (!viewerRef.current) return;
      const camera = viewerRef.current.camera;
      const position = camera.position.clone();
      const dirVec = new Cartesian3(
        ecefDirection[0],
        ecefDirection[1],
        ecefDirection[2]
      );
      const upVec = new Cartesian3(up[0], up[1], up[2]);

      const dirMagnitude = Cartesian3.magnitude(dirVec);
      if (dirMagnitude < CesiumMath.EPSILON6) {
        console.warn("Skipping setView due to near-zero vector.");
        return;
      }

      const normalizedEcefDirection = Cartesian3.normalize(
        dirVec,
        new Cartesian3()
      );

      camera.setView({
        destination: position,
        orientation: {
          direction: normalizedEcefDirection,
          up: upVec,
        },
      });
    },
    [viewerRef]
  );

  // Function to transform local ENU direction to ECEF
  const handleLocalDirectionChange = useCallback(
    (newLocalDirection: Vector3Arr) => {
      if (
        !isInitializedRef.current ||
        !transformMatrixRef.current.localToFixed ||
        !viewerRef.current
      ) {
        return;
      }

      setDirectionVectorLocal(newLocalDirection);

      // Reset the base ENU direction when manually changing the direction
      setBaseENUDirection([...newLocalDirection]);

      // Convert local ENU direction to ECEF
      const localDirCartesian = new Cartesian3(
        newLocalDirection[0],
        newLocalDirection[1],
        newLocalDirection[2]
      );

      // Skip conversion if near-zero vector
      if (Cartesian3.magnitude(localDirCartesian) < CesiumMath.EPSILON10) {
        return;
      }

      // Transform from local ENU to ECEF
      const ecefDirection = Matrix4.multiplyByPointAsVector(
        transformMatrixRef.current.localToFixed,
        localDirCartesian,
        new Cartesian3()
      );

      // Update ECEF direction with transformed vector
      setDirectionVectorECEF([
        ecefDirection.x,
        ecefDirection.y,
        ecefDirection.z,
      ]);
    },
    [viewerRef]
  );

  // Function to apply negated photoMatch vector from third row to local ENU direction
  const applyNegatedOrientationVector = useCallback(
    (row) => {
      if (!row || row.length < 3) {
        console.debug("No valid orientation vector found in photoMatch");
        return;
      }
      // Extract values and negate them
      const [x, y, z] = row.map((value) => -parseFloat(value));
      // Apply to local ENU direction
      handleLocalDirectionChange([x, y, z]);
    },
    [handleLocalDirectionChange]
  );

  // Function to apply one-time rotation to the base ENU direction vector
  const applyRotationAndTransform = useCallback(() => {
    if (!isInitializedRef.current || !transformMatrixRef.current.localToFixed)
      return;

    // Use the current vector as the base if baseENUDirection isn't set yet
    const baseVector = baseENUDirection || directionVectorLocal;
    if (!baseVector) return;

    // Start with the base ENU direction vector (not the potentially already rotated one)
    const [x, y, z] = baseVector;

    // Step 1: Clone and create directionENUinUTM by applying rotation
    // Convert angle to radians
    const radians = CesiumMath.toRadians(rotationAngle);

    // Apply 2D rotation on XY plane
    const cosAngle = Math.cos(radians);
    const sinAngle = Math.sin(radians);

    // Rotation formula: x' = x*cos(θ) - y*sin(θ), y' = x*sin(θ) + y*cos(θ)
    const rotatedX = x * cosAngle - y * sinAngle;
    const rotatedY = x * sinAngle + y * cosAngle;

    // Create directionENUinUTM with the rotation applied
    const newDirectionENUinUTM: Vector3Arr = [rotatedX, rotatedY, z];
    setDirectionENUinUTM(newDirectionENUinUTM);

    // Create Cartesian3 for further transforms
    const directionENUinUTMCartesian = new Cartesian3(
      newDirectionENUinUTM[0],
      newDirectionENUinUTM[1],
      newDirectionENUinUTM[2]
    );

    // Skip further transformations if near-zero vector
    if (
      Cartesian3.magnitude(directionENUinUTMCartesian) < CesiumMath.EPSILON10
    ) {
      return;
    }

    // Step 2: Transform to WGS84 (the same as directionENUinUTM for our purposes,
    // but in a real system this might involve a coordinate transformation)
    const directionENUinWGS84Cartesian = Cartesian3.clone(
      directionENUinUTMCartesian
    );
    const newDirectionENUinWGS84: Vector3Arr = [
      directionENUinWGS84Cartesian.x,
      directionENUinWGS84Cartesian.y,
      directionENUinWGS84Cartesian.z,
    ];

    // Step 3: Transform from local ENU (in WGS84) to ECEF
    const ecefDirectionCartesian = Matrix4.multiplyByPointAsVector(
      transformMatrixRef.current.localToFixed,
      directionENUinWGS84Cartesian,
      new Cartesian3()
    );

    // Create final ECEF direction vector
    const newDirectionECEF: Vector3Arr = [
      ecefDirectionCartesian.x,
      ecefDirectionCartesian.y,
      ecefDirectionCartesian.z,
    ];

    // CRITICAL: Update the directionVectorLocal to match the new rotated vector
    // This ensures the user is now editing the rotated vector
    setDirectionVectorLocal(newDirectionENUinUTM);

    // Update ECEF direction vector that gets applied to the camera
    setDirectionVectorECEF(newDirectionECEF);

    // Log transformation chain for debugging
    console.debug(
      `One-time rotation applied to base vector:\n` +
        `Base ENU = [${x.toFixed(4)}, ${y.toFixed(4)}, ${z.toFixed(4)}]\n` +
        `Rotation: ${rotationAngle}°\n` +
        `ENU in UTM (rotated) = [${newDirectionENUinUTM[0].toFixed(
          4
        )}, ${newDirectionENUinUTM[1].toFixed(
          4
        )}, ${newDirectionENUinUTM[2].toFixed(4)}]\n` +
        `ECEF = [${newDirectionECEF[0].toFixed(
          4
        )}, ${newDirectionECEF[1].toFixed(4)}, ${newDirectionECEF[2].toFixed(
          4
        )}]`
    );
  }, [
    baseENUDirection,
    directionVectorLocal,
    rotationAngle,
    isInitializedRef,
    transformMatrixRef,
  ]);

  // Effect to apply changes when ECEF vectors are updated by sliders
  useEffect(() => {
    if (isInitializedRef.current && viewerRef.current) {
      applyCameraVectors(directionVectorECEF, upVector);
    }
  }, [directionVectorECEF, upVector, applyCameraVectors, viewerRef]);

  // Effect to update the local display vector when ECEF direction changes
  useEffect(() => {
    if (
      isInitializedRef.current &&
      transformMatrixRef.current.fixedToLocal &&
      viewerRef.current
    ) {
      const currentDirECEF_Cartesian = new Cartesian3(
        directionVectorECEF[0],
        directionVectorECEF[1],
        directionVectorECEF[2]
      );
      if (
        Cartesian3.magnitude(currentDirECEF_Cartesian) > CesiumMath.EPSILON10
      ) {
        const localDir = Matrix4.multiplyByPointAsVector(
          transformMatrixRef.current.fixedToLocal,
          currentDirECEF_Cartesian,
          new Cartesian3()
        );
        setDirectionVectorLocal([localDir.x, localDir.y, localDir.z]);
      } else {
        setDirectionVectorLocal([0, 0, 0]);
      }

      // Store current camera state in a global variable so other components can access it
      (window as any).__obliqueCameraState = {
        directionVectorECEF,
        upVector,
        position: transformMatrixRef.current.lastPosition,
      };
    }
  }, [directionVectorECEF, upVector, viewerRef]);

  // Effect to find matching photo data when imageRecord changes
  useEffect(() => {
    const id = nearestImage?.record?.id;
    if (id && exteriorOrientations && exteriorOrientations[id]) {
      const matchingPhoto = exteriorOrientations[id];
      setPhotoMatch(mapExtOriArrToRecord(id, matchingPhoto) || null);
    } else {
      setPhotoMatch(null);
    }
  }, [nearestImage, exteriorOrientations]);

  // Effect to apply the negated orientation vector by default when photoMatch changes
  useEffect(() => {
    if (photoMatch && photoMatch.m[2] && isInitializedRef.current) {
      // Apply the negated orientation vector by default
      applyNegatedOrientationVector(photoMatch.m[2]);
    }
  }, [photoMatch, applyNegatedOrientationVector, isInitializedRef]);

  // Effect to apply rotation when rotation angle changes
  useEffect(() => {
    if (
      isInitializedRef.current &&
      baseENUDirection &&
      transformMatrixRef.current.localToFixed &&
      rotationAngle !== undefined
    ) {
      // Skip the initial render
      if (rotationAngle === 1.5 && !directionENUinUTM) return;

      // Apply rotation automatically when angle changes
      applyRotationAndTransform();
    }
  }, [
    rotationAngle,
    baseENUDirection,
    isInitializedRef,
    applyRotationAndTransform,
    directionENUinUTM,
  ]);

  if (!shouldRender || isMode2d) {
    return null;
  }
  // --- styles and derived formatting for render ---

  const directionLabelStyle = {
    fontWeight: 800,
    fontSize: "16px",
  };

  const headingDisplayStyle = {
    fontWeight: 600,
    fontSize: "14px",
    color: "#333",
    userSelect: "none" as const,
  };

  const activeButtonClass = "!bg-blue-100 !border-blue-400";

  const headingDegrees = formatHeadingDegrees(currentHeading);

  const offsetDegrees = Math.round(CesiumMath.toDegrees(headingOffset));

  return (
    <>
      <ObliqueFootprintLayer />
      {isDebugMode && <ObliqueDebugSvg />}
      {isDebugMode && nearestImage && (
        <>
          <ObliqueImageInfo imageRecord={nearestImage} />
          {/* Camera vector controls component */}
          <CameraVectorControls
            directionVectorLocal={directionVectorLocal}
            rotationAngle={rotationAngle}
            setRotationAngle={setRotationAngle}
            upVector={upVector}
            setUpVector={setUpVector}
          />
        </>
      )}
      {nearestImage && previewPath && nearestImage.record.id && (
        <ObliqueImagePreview
          src={previewUrl}
          alt={`Image preview ${nearestImage.record.id}`}
          isVisible={isPreviewVisible}
          onOpenImageLink={openImageLink}
          onDirectDownload={handleDirectDownload}
          onClose={() => {
            setIsPreviewVisible(false);
            notifyPreviewVisibilityChange(false);
            setLockFootprint(false);
          }}
        />
      )}
      <div
        className="camera-rotation-controls-container"
        style={{
          position: "absolute",
          bottom: "60px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
          zIndex: 1000,
          opacity: isVisible && !isPreviewVisible ? 1 : 0,
          transition: "opacity 300ms ease-in-out",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          {nearestImage && (
            <>
              <Tooltip
                placement="right"
                title={
                  "Zur ausgewählten Schrägluftbild-Aufnahmeposition fliegen"
                }
              >
                <div>
                  <ControlButtonStyler
                    onClick={flyToNearestImage}
                    width="160px"
                    height="40px"
                  >
                    <span>Flug zum Bild</span>
                  </ControlButtonStyler>
                </div>
              </Tooltip>

              {photoMatch && (
                <Tooltip
                  placement="right"
                  title={"Mit verbesserter Orientierung zum Bild fliegen"}
                >
                  <div>
                    <ControlButtonStyler
                      onClick={flyToImprovedCameraOrientation}
                      width="160px"
                      height="40px"
                      className="bg-blue-50 hover:bg-blue-100"
                    >
                      <span className="flex items-center text-base">
                        <FontAwesomeIcon icon={faMagic} className="mr-2" />
                        Optimierte Ansicht
                      </span>
                    </ControlButtonStyler>
                  </div>
                </Tooltip>
              )}
            </>
          )}

          {nearestImage && previewPath && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                paddingBottom: "40px",
              }}
            >
              <Tooltip
                placement="right"
                title="Bild in hoher Qualität in neuem Tab öffnen"
              >
                <div>
                  <ControlButtonStyler onClick={openImageLink} width="160px">
                    <span className="flex items-center text-base">
                      <FontAwesomeIcon icon={faExternalLink} className="mr-2" />
                      Bild öffnen
                    </span>
                  </ControlButtonStyler>
                </div>
              </Tooltip>

              <Tooltip placement="right" title="Bild direkt herunterladen">
                <div>
                  <ControlButtonStyler
                    onClick={handleDirectDownload}
                    width="160px"
                  >
                    <span className="flex items-center text-base">
                      <FontAwesomeIcon
                        icon={faFileArrowDown}
                        className="mr-2"
                      />
                      Herunterladen
                    </span>
                  </ControlButtonStyler>
                </div>
              </Tooltip>
            </div>
          )}

          {/* Cardinal direction controls with loading spinner overlay */}
          <div
            className="camera-rotation-controls"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gridTemplateRows: "repeat(3, 1fr)",
              gap: "4px",
              padding: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.4)",
              borderRadius: "8px",
              boxShadow: "0 0 8px rgba(0, 0, 0, 0.2)",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255, 255, 255, 0.8)",
                zIndex: 10,
                borderRadius: "8px",
                opacity: isAllDataReady ? 0 : 1,
                transition: "opacity 0.5s ease",
                pointerEvents: isAllDataReady ? "none" : "auto",
              }}
            >
              <FontAwesomeIcon
                icon={faSpinner}
                spin
                style={{ fontSize: "24px", marginBottom: "10px" }}
              />
              <div style={{ textAlign: "center", fontSize: "12px" }}>
                Schrägluftbild-Daten werden geladen...
              </div>
            </div>
            {/* Top row */}
            <ControlButtonStyler
              onClick={() => rotateCamera(false)}
              width="40px"
              height="40px"
            >
              <FontAwesomeIcon icon={faRotateLeft} className="text-base" />
            </ControlButtonStyler>
            <ControlButtonStyler
              onClick={() => rotateToDirection(CardinalDirectionEnum.North)}
              width="40px"
              height="40px"
              className={
                activeDirection === CardinalDirectionEnum.North
                  ? activeButtonClass
                  : ""
              }
            >
              <span style={directionLabelStyle}>N</span>
            </ControlButtonStyler>
            <ControlButtonStyler
              onClick={() => rotateCamera(true)}
              width="40px"
              height="40px"
            >
              <FontAwesomeIcon icon={faRotateRight} className="text-base" />
            </ControlButtonStyler>

            {/* Middle row */}
            <ControlButtonStyler
              onClick={() => rotateToDirection(CardinalDirectionEnum.West)}
              width="40px"
              height="40px"
              className={
                activeDirection === CardinalDirectionEnum.West
                  ? activeButtonClass
                  : ""
              }
            >
              <span style={directionLabelStyle}>W</span>
            </ControlButtonStyler>
            <Tooltip
              title={`Luftbildblickrichtung "Nord" hat ${offsetDegrees} Grad Abweichung von Nord`}
              placement="top"
              overlayInnerStyle={{
                userSelect: "none",
                pointerEvents: "none",
              }}
              overlayStyle={{
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  margin: "2px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={headingDisplayStyle}>{headingDegrees}°</span>
              </div>
            </Tooltip>
            <ControlButtonStyler
              onClick={() => rotateToDirection(CardinalDirectionEnum.East)}
              width="40px"
              height="40px"
              className={
                activeDirection === CardinalDirectionEnum.East
                  ? activeButtonClass
                  : ""
              }
            >
              <span style={directionLabelStyle}>O</span>
            </ControlButtonStyler>

            {/* Bottom row */}
            <div style={{ width: "40px", height: "40px", margin: "2px" }}>
              {/* Empty bottom-left cell */}
            </div>
            <ControlButtonStyler
              onClick={() => rotateToDirection(CardinalDirectionEnum.South)}
              width="40px"
              height="40px"
              className={
                activeDirection === CardinalDirectionEnum.South
                  ? activeButtonClass
                  : ""
              }
            >
              <span style={directionLabelStyle}>S</span>
            </ControlButtonStyler>
            <div style={{ width: "40px", height: "40px", margin: "2px" }}>
              {/* Empty bottom-right cell */}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ObliqueControls;
