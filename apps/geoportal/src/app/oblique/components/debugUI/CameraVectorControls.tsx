import { type CSSProperties, styled } from "styled-components";

import { InputNumber, Row, Col } from "antd";
import { ExteriorOrientationRecord } from "../../types";
import VectorInput from "./VectorInput";
import { UnitVectorDisplay } from "./UnitVectorDisplay";
import { Vector3Arr } from "types/math";

// Component for 2D unit circle visualization of direction vector

const Container = styled.section`
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  padding: 12px;
  width: 350px;
  max-width: 90%;
`;
const style: CSSProperties = {
  //display: "none",
  position: "absolute",
  top: "10px",
  right: "10px",
  zIndex: 2000,
};

interface CameraVectorControlsProps {
  photoMatch?: ExteriorOrientationRecord;
  directionVectorLocal: Vector3Arr;
  upVector: Vector3Arr;
  setUpVector: (vector: Vector3Arr) => void;
}

// --- Component: CameraVectorControls ---
export const CameraVectorControls: React.FC<CameraVectorControlsProps> = ({
  photoMatch,
  directionVectorLocal,
  upVector,
  setUpVector,
}: CameraVectorControlsProps) => {
  if (!photoMatch) return null;

  return (
    <Container style={style}>
      Camera Vector Controls Image Record ID: {photoMatch.id || "N/A"}
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
        </div>
      )}
      {/* Local ENU Direction Controls (Interactive) */}
      <div style={{ marginBottom: 16 }}>
        Direction (Local ENU - Interactive)
        {/* XY Circle Direction Control */}
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <UnitVectorDisplay vector={directionVectorLocal} />
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
