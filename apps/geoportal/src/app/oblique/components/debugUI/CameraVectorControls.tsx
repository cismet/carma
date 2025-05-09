import React, { useState } from "react";
import { Collapse } from "antd";
import type { CollapseProps } from "antd";
import type { Vector3Arr } from "@carma-commons/types";

import VectorInput from "./VectorInput";
import { UnitVectorDisplay } from "./UnitVectorDisplay";
import type { DerivedExteriorOrientation } from "../../utils/transformExteriorOrientation";

interface CameraVectorControlsProps {
  photoId?: string;
  exteriorOrientation: DerivedExteriorOrientation;
  directionVectorLocal: Vector3Arr;
  upVector: Vector3Arr;
  setUpVector: (vector: Vector3Arr) => void;
}

// --- Component: CameraVectorControls ---
export const CameraVectorControls: React.FC<CameraVectorControlsProps> = ({
  photoId,
  exteriorOrientation,
  directionVectorLocal,
  upVector,
  setUpVector,
}: CameraVectorControlsProps) => {
  const [activeKey, setActiveKey] = useState<string[]>([]);

  if (!exteriorOrientation || !photoId) return null;

  const onChange = (key: string | string[]) => {
    setActiveKey(Array.isArray(key) ? key : [key]);
  };

  const m = exteriorOrientation.rotation.enu.sourceCRS.m;

  const items: CollapseProps["items"] = [
    {
      key: "1",
      label: "Camera Vector Controls",
      children: (
        <>
          Camera Vector Controls Image Record ID: {photoId || "N/A"}
          <div>
            <pre style={{ margin: 0, fontSize: "9px" }}>
              {m[0].map((value) => value.toFixed(5)).join(" ")}
            </pre>
            <pre style={{ margin: 0, fontSize: "9px" }}>
              {m[1].map((value) => value.toFixed(5)).join(" ")}
            </pre>
            <pre style={{ margin: 0, fontSize: "9px" }}>
              {m[2].map((value) => value.toFixed(5)).join(" ")}
            </pre>
          </div>
          {/* Local ENU Direction Controls (Interactive) */}
          <div style={{ marginBottom: 16 }}>
            Direction (Local ENU)
            {/* XY Circle Direction Control */}
            <div style={{ marginTop: 8, marginBottom: 8 }}>
              <UnitVectorDisplay vector={directionVectorLocal} />
            </div>
          </div>
          {/* Up Controls (Applied) */}
          <VectorInput label="Up" values={upVector} onChange={setUpVector} />
        </>
      ),
    },
  ];

  return (
    <Collapse
      items={items}
      activeKey={activeKey}
      onChange={onChange}
      style={{
        background: "rgba(255, 255, 255, 0.9)",
        borderRadius: "4px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
      }}
    />
  );
};
