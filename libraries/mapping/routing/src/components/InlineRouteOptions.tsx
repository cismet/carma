import { Spin } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock, faRoute } from "@fortawesome/free-solid-svg-icons";
import type { RouteOption } from "../utils/routeDisplay";
import {
  formatDuration,
  formatDistance,
  getModeIcon,
  getModeLabel,
} from "../utils/formatters";

interface InlineRouteOptionsProps {
  onSelectRoute: (route: RouteOption) => void;
  routes: RouteOption[];
  loading?: boolean;
}

export const InlineRouteOptions = ({
  onSelectRoute,
  routes,
  loading = false,
}: InlineRouteOptionsProps) => {
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px 0",
        }}
      >
        <Spin size="default" />
        <p style={{ marginTop: "12px", fontSize: "14px", color: "#6b7280" }}>
          Routen werden berechnet...
        </p>
      </div>
    );
  }

  if (routes.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px 0",
        }}
      >
        <p style={{ fontSize: "14px", color: "#6b7280" }}>
          Keine Routen gefunden
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {routes.map((route) => (
        <button
          key={route.index}
          onClick={() => onSelectRoute(route)}
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            padding: "12px",
            textAlign: "left",
            background: "white",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#3b82f6";
            e.currentTarget.style.backgroundColor = "#f9fafb";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#e5e7eb";
            e.currentTarget.style.backgroundColor = "white";
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <FontAwesomeIcon
                icon={getModeIcon(route.mode)}
                style={{ fontSize: "18px", color: "#3b82f6" }}
              />
              <span style={{ fontWeight: 500 }}>
                {getModeLabel(route.mode)}
              </span>
            </div>
          </div>
          <div
            style={{
              marginTop: "8px",
              display: "flex",
              gap: "24px",
              fontSize: "14px",
              color: "#4b5563",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <FontAwesomeIcon icon={faClock} style={{ fontSize: "12px" }} />
              <span>{formatDuration(route.duration)}</span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <FontAwesomeIcon icon={faRoute} style={{ fontSize: "12px" }} />
              <span>{formatDistance(route.distance)}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

export default InlineRouteOptions;
