interface LoadingSpinnerProps {
  message?: string;
}

const LoadingSpinner = ({
  message = "Layer werden geladen...",
}: LoadingSpinnerProps) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 24,
      padding: "16px 20px",
      background: "#fff",
      borderRadius: 10,
      boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
    }}
  >
    <div
      style={{
        width: 20,
        height: 20,
        border: "3px solid #e2e8f0",
        borderTopColor: "#667eea",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    <span style={{ fontSize: 14, color: "#4a5568", fontWeight: 500 }}>
      {message}
    </span>
  </div>
);

export default LoadingSpinner;
