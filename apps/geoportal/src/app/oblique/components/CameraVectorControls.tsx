import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  type RefObject,
} from "react";
import { styled } from "styled-components";
import {
  Cartesian3,
  type Viewer,
  Transforms,
  Matrix4,
  Math as CesiumMath,
} from "cesium";
import { Button, InputNumber, Row, Col } from "antd";
import {
  NearestObliqueImageRecord,
  ObliqueImageRecord,
  ExteriorOrientationDataArray,
} from "../types";
import VectorInput from "./VectorInput";
import { UnitVectorDisplay } from "./UnitVectorDisplay";
import { Matrix3RowMajor, Vector3Arr } from "types/math";
import { useObliqueDataContext } from "../hooks/useObliqueDataContext";

const DEFAULT_UTM_GRID_CONVERGENCE_ANGLE = 1.52;
// Default angle for UTM grid convergence good baseline for most cases within Local wuppertal Extent, but should be calculated for each image from the UTM coordinates

interface CameraVectorControlsProps {
  imageRecord?: ObliqueImageRecord | NearestObliqueImageRecord;
  viewer: RefObject<Viewer>;
  style?: React.CSSProperties;
}

// Component for 2D unit circle visualization of direction vector

const Container = styled.section`
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  padding: 12px;
  width: 350px;
  max-width: 90%;
`;

type ExteriorOrientationRecord = {
  id: string;
  x: number;
  y: number;
  z: number;
  m: Matrix3RowMajor;
};

const mapExtOriArrToRecord = (
  id: string,
  arr: ExteriorOrientationDataArray
): ExteriorOrientationRecord => {
  const x = arr[0];
  const y = arr[1];
  const z = arr[2];
  const row0 = arr[3];
  const row1 = arr[4];
  const row2 = arr[5];
  const m: Matrix3RowMajor = [row0, row1, row2];
  return {
    id,
    x,
    y,
    z,
    m,
  };
};

// --- Component: CameraVectorControls ---
export const CameraVectorControls: React.FC<CameraVectorControlsProps> = ({
  imageRecord,
  viewer,
  style,
}) => {
  const { exteriorOrientations } = useObliqueDataContext();

  const [photoMatch, setPhotoMatch] =
    useState<ExteriorOrientationRecord | null>(null);

  // State for ECEF vectors (manipulated by user, applied to camera)
  const [directionVectorECEF, setDirectionVectorECEF] = useState<Vector3Arr>([
    0, 0, -1,
  ]);
  const [upVector, setUpVector] = useState<Vector3Arr>([0, 1, 0]);

  // State for Local ENU direction vector (interactive)
  const [directionVectorLocal, setDirectionVectorLocal] = useState<Vector3Arr>([
    0, 0, 0,
  ]);

  // State for original base ENU direction vector (never modified by rotation)
  const [baseENUDirection, setBaseENUDirection] = useState<Vector3Arr | null>(
    null
  );

  // Additional states for transformation visualization
  const [directionENUinUTM, setDirectionENUinUTM] = useState<Vector3Arr | null>(
    null
  );
  const [directionENUinWGS84, setDirectionENUinWGS84] =
    useState<Vector3Arr | null>(null);

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

  // Initialize ECEF vectors, transform, and local display
  useEffect(() => {
    if (viewer.current && viewer.current.camera) {
      console.log("Initializing ECEF vectors and local frame...");
      const camera = viewer.current.camera;
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
        viewer.current.scene.globe.ellipsoid,
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
  }, [viewer, imageRecord]);

  // Effect to store the base ENU direction when directionVectorLocal changes
  useEffect(() => {
    if (isInitializedRef.current && directionVectorLocal && !baseENUDirection) {
      setBaseENUDirection([...directionVectorLocal]);
    }
  }, [directionVectorLocal, baseENUDirection, isInitializedRef]);

  // Function to apply ECEF vectors to the camera
  const applyCameraVectors = useCallback(
    (ecefDirection: Vector3Arr, up: Vector3Arr) => {
      if (!viewer.current) return;
      const camera = viewer.current.camera;
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
    [viewer]
  );

  // Function to transform local ENU direction to ECEF
  const handleLocalDirectionChange = useCallback(
    (newLocalDirection: Vector3Arr) => {
      if (
        !isInitializedRef.current ||
        !transformMatrixRef.current.localToFixed ||
        !viewer.current
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
    [viewer]
  );

  // Function to rotate X and Y components by a specified angle
  const rotateXYByAngle = useCallback(
    (angle: number) => {
      if (!directionVectorLocal || !isInitializedRef.current) return;

      const [x, y, z] = directionVectorLocal;

      // Convert angle to radians
      const radians = CesiumMath.toRadians(angle);

      // Apply 2D rotation on XY plane
      const cosAngle = Math.cos(radians);
      const sinAngle = Math.sin(radians);

      // Rotation formula: x' = x*cos(θ) - y*sin(θ), y' = x*sin(θ) + y*cos(θ)
      const newX = x * cosAngle - y * sinAngle;
      const newY = x * sinAngle + y * cosAngle;

      // Update local direction with rotated values
      handleLocalDirectionChange([newX, newY, z]);

      console.debug(
        `XY rotated by ${angle}°, new vector=[${newX.toFixed(
          4
        )}, ${newY.toFixed(4)}, ${z.toFixed(4)}]`
      );
    },
    [directionVectorLocal, handleLocalDirectionChange]
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
    setDirectionENUinWGS84(newDirectionENUinWGS84);

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
    if (isInitializedRef.current && viewer.current) {
      applyCameraVectors(directionVectorECEF, upVector);
    }
  }, [directionVectorECEF, upVector, applyCameraVectors, viewer]);

  // Effect to update the local display vector when ECEF direction changes
  useEffect(() => {
    if (
      isInitializedRef.current &&
      transformMatrixRef.current.fixedToLocal &&
      viewer.current
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
  }, [directionVectorECEF, upVector, viewer]);

  // Effect to find matching photo data when imageRecord changes
  useEffect(() => {
    const id = imageRecord?.record.id;
    if (id && exteriorOrientations && exteriorOrientations[id]) {
      const matchingPhoto = exteriorOrientations[id];
      setPhotoMatch(mapExtOriArrToRecord(id, matchingPhoto) || null);
    } else {
      setPhotoMatch(null);
    }
  }, [imageRecord, exteriorOrientations]);

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

  return (
    <Container style={style}>
      Camera Vector Controls Image Record ID: {imageRecord.record.id || "N/A"}
      {photoMatch && (
        <div>
          <pre style={{ margin: 0, fontSize: "9px" }}>
            {photoMatch.m[0].map((value) => value.toFixed(5)).join(" ")}
          </pre>
          <pre style={{ margin: 0, fontSize: "9px" }}>
            {photoMatch.m[1].map((value) => value.toFixed(5)).join(" ")}
          </pre>
          <pre style={{ margin: 0, fontSize: "9px" }}>
            {photoMatch.m[2].map((value) => value.toFixed(5)).join(" ")}
          </pre>
          <Button
            size="small"
            type="primary"
            onClick={() => applyNegatedOrientationVector(photoMatch.m[2])}
            disabled={!photoMatch.m[2]}
            style={{ marginBottom: "8px" }}
          >
            Apply Negated Orientation Vector to Direction
          </Button>
        </div>
      )}
      {/* Local ENU Direction Controls (Interactive) */}
      <div style={{ marginBottom: 16 }}>
        Direction (Local ENU - Interactive)
        {/* XY Circle Direction Control */}
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <UnitVectorDisplay vector={directionVectorLocal} />
        </div>
        {/* XY Rotation Control */}
        <div style={{ marginTop: 8, marginBottom: 16 }}>
          <Row gutter={8} align="middle">
            <Col span={12}>Rotate XY Direction</Col>
            <Col span={8}>
              <InputNumber
                value={rotationAngle}
                onChange={(value) => setRotationAngle(Number(value) || 0)}
                size="small"
                min={-5}
                max={5}
                precision={2}
                step={0.01}
                addonAfter="°"
                style={{ width: "100%" }}
              />
            </Col>
            <Col span={4}>
              <Button
                size="small"
                type="primary"
                onClick={applyRotationAndTransform}
              >
                Apply
              </Button>
            </Col>
          </Row>
        </div>
      </div>
      {/* Up Controls (Applied) */}
      <VectorInput
        label="Up (Applied)"
        values={upVector}
        onChange={setUpVector}
      />
    </Container>
  );
};
