import { ProgressBar } from "react-bootstrap";

interface ProgressIndicatorProps {
  progress: number;
  show: boolean;
  message?: string;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  progress,
  show,
  message = "Daten werden geladen und gecached ...",
}) => {
  if (!show) return null;

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 1000,
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        backgroundColor: "rgba(255, 255, 255, 0.65)",
        padding: "25px 30px",
        borderRadius: "12px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.1), 0 5px 10px rgba(0,0,0,0.05)",
        width: "350px",
        border: "1px solid rgba(0,0,0,0.1)",
        backdropFilter: "blur(5px)",
      }}
    >
      <div
        style={{
          fontSize: "14px",
          marginBottom: "12px",
          color: "#666",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        {message}
      </div>
      <ProgressBar
        now={progress}
        style={{
          height: "20px",
          borderRadius: "10px",
          overflow: "hidden",
        }}
        variant="secondary"
        animated
      />
    </div>
  );
};
