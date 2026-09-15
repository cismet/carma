import { useContext } from "react";
import { LogoutOutlined, UserOutlined, DisconnectOutlined } from "@ant-design/icons";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

interface TitleControlProps {
  user?: string | null;
  onLogout: () => void;
  connectionError?: boolean;
}

export const TitleControl = ({
  user,
  onLogout,
  connectionError = false,
}: TitleControlProps) => {
  const { windowSize } = useContext(ResponsiveTopicMapContext) as {
    windowSize?: { width: number };
  };
  const narrow = (windowSize?.width ?? 800) < 560;

  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          background: "rgba(255,255,255,0.93)",
          borderRadius: 20,
          padding: "4px 14px",
          boxShadow: "0 1px 6px rgba(0,0,0,0.35)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 14,
          whiteSpace: "nowrap",
        }}
      >
        <b>{narrow ? "Leerstand" : "Leerstandsmanagement"}</b>
        {connectionError && (
          <span style={{ color: "#c62828" }} title="Keine Verbindung zum Server">
            <DisconnectOutlined /> offline
          </span>
        )}
        {user && (
          <span>
            <UserOutlined /> {user}
          </span>
        )}
        {user && (
          <a onClick={onLogout} title="Abmelden">
            <LogoutOutlined />
            {!narrow && " abmelden"}
          </a>
        )}
      </div>
    </div>
  );
};
