type CrosshairProps = {
  lineColor?: string;
  lineOpacity?: number;
  circleColor?: string;
  circleOpacity?: number;
  circleSize?: number;
  width?: number;
};

const Crosshair = ({
  lineColor = "#fff",
  lineOpacity = 0.5,
  circleColor = "#ddd",
  circleOpacity = 1,
  circleSize = 20,
  width = 1,
}: CrosshairProps) => {
  return (
    <div
      className="crosshair"
      style={{
        position: "absolute",
        pointerEvents: "none",
        width: "100%",
        height: "100%",
        top: 0,
        left: 0,
      }}
    >
      <div
        className=" horizontal"
        style={{
          position: "absolute",
          top: "50%",
          width: "100%",
          height: width,
          backgroundColor: lineColor,
          opacity: lineOpacity,
          transform: "translateY(-50%)",
          mixBlendMode: "difference",
        }}
      />
      <div
        className="crosshair-line vertical"
        style={{
          position: "absolute",
          left: "50%",
          height: "100%",
          width: width,
          backgroundColor: lineColor,
          opacity: lineOpacity,
          transform: "translateX(-50%)",
          mixBlendMode: "difference",
        }}
      />
      <div
        style={{
          position: "absolute",
          borderRadius: "50%",
          left: "50%",
          top: "50%",
          height: circleSize,
          width: circleSize,
          backgroundColor: circleColor,
          opacity: circleOpacity,
          transform: "translate(-50%, -50%)",
          mixBlendMode: "multiply",
        }}
      ></div>
    </div>
  );
};
export default Crosshair;
