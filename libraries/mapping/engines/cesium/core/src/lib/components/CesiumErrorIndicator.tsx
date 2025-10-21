import { useState, useEffect } from "react";
import { Modal } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";

type CesiumError = {
  timestamp: string;
  message: string;
  stack?: string;
};

export const CesiumErrorIndicator = () => {
  const [errors, setErrors] = useState<CesiumError[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const handleError = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as {
        error?: Error;
        meta?: Record<string, unknown>;
      };
      
      const error: CesiumError = {
        timestamp: new Date().toISOString(),
        message: detail.error?.message || "Unknown Cesium error",
        stack: detail.error?.stack,
      };

      setErrors((prev) => [error, ...prev].slice(0, 10)); // Keep last 10 errors
    };

    window.addEventListener("carma:cesium:renderError", handleError);
    return () => window.removeEventListener("carma:cesium:renderError", handleError);
  }, []);

  if (errors.length === 0) return null;

  const lastError = errors[0];
  const lastErrorTime = new Date(lastError.timestamp);
  const timeAgo = Math.floor((Date.now() - lastErrorTime.getTime()) / 1000);

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 1000,
          cursor: "pointer",
          background: "#fff3cd",
          border: "1px solid #ffc107",
          borderRadius: 4,
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}
        onClick={() => setIsModalOpen(true)}
      >
        <ExclamationCircleOutlined style={{ color: "#ff9800", fontSize: 20 }} />
        <div style={{ fontSize: 12 }}>
          <div style={{ fontWeight: 600 }}>Cesium recovered from error</div>
          <div style={{ color: "#666" }}>
            {errors.length} error{errors.length > 1 ? "s" : ""} • {timeAgo}s ago
          </div>
        </div>
      </div>

      <Modal
        title={
          <span>
            <ExclamationCircleOutlined style={{ color: "#ff9800", marginRight: 8 }} />
            Cesium Error Log
          </span>
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={700}
      >
        <div style={{ maxHeight: 500, overflow: "auto" }}>
          {errors.map((error, idx) => (
            <div
              key={idx}
              style={{
                padding: 12,
                marginBottom: 8,
                background: "#f5f5f5",
                borderRadius: 4,
                borderLeft: "3px solid #ff9800",
              }}
            >
              <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>
                {new Date(error.timestamp).toLocaleString()}
              </div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>{error.message}</div>
              {error.stack && (
                <details style={{ fontSize: 11, color: "#666", marginTop: 8 }}>
                  <summary style={{ cursor: "pointer" }}>Stack trace</summary>
                  <pre
                    style={{
                      marginTop: 8,
                      padding: 8,
                      background: "#fff",
                      borderRadius: 4,
                      overflow: "auto",
                      maxHeight: 200,
                    }}
                  >
                    {error.stack}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, padding: 12, background: "#e3f2fd", borderRadius: 4 }}>
          <div style={{ fontSize: 12, color: "#1976d2" }}>
            ℹ️ The 3D scene was automatically reinitialized. You can continue working normally.
          </div>
        </div>
      </Modal>
    </>
  );
};
