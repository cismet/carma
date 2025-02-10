import { useEffect, useState } from "react";

const PI_OVER_2 = Math.PI / 2;

export const CompassNeedleSVG = ({
  pitch = 0,
  heading = 0,
  northColor = "#d65",
  neutralColor = "#bbb",
}: {
  pitch?: number;
  heading?: number;
  northColor?: string;
  neutralColor?: string;
} = {}) => {
  const [transform, setTransform] = useState("");

  useEffect(() => {
    if (pitch && heading) {
      const normalizedHeading = -heading;
      const normalizedPitch = pitch + PI_OVER_2;
      const transform = `rotateX(${normalizedPitch}rad) rotateZ(${normalizedHeading}rad)`;
      setTransform(transform);
    }
  }, [pitch, heading]);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="10"
      height="10"
      viewBox="-5 -5 10 10"
      style={{
        width: "100%",
        height: "100%",
        transformOrigin: "center",
        transform,
        transformStyle: "preserve-3d",
      }}
    >
      <path d="M0,-5 L2,0 L-2,0 Z" fill={northColor} />
      <path d="M0,5 L-2 ,0 L2,0 Z" fill={neutralColor} />
      <circle cx="0" cy="0" r="0.7" fill="#333" />
    </svg>
  );
};

export default CompassNeedleSVG;
