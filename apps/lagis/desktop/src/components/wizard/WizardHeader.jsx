import React from "react";
import { Button, Tooltip } from "antd";
import { CodeOutlined } from "@ant-design/icons";

const WizardHeader = ({ subtitle, showLogsToggle, logsOpen, onLogsChange }) => (
  <div
    className="flex items-start justify-between gap-2"
    style={{ paddingRight: 32 }}
  >
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>
        Flurstück Assistent
      </div>
      <div className="text-gray-500" style={{ fontSize: 12, fontWeight: 400 }}>
        {subtitle}
      </div>
    </div>
    {showLogsToggle && (
      <Tooltip title={logsOpen ? "Assistent anzeigen" : "GraphQL anzeigen"}>
        <Button
          size="small"
          shape="circle"
          type={logsOpen ? "primary" : "text"}
          icon={<CodeOutlined />}
          aria-label="GraphQL"
          onClick={() => onLogsChange(!logsOpen)}
          style={logsOpen ? undefined : { color: "#8c8c8c" }}
        />
      </Tooltip>
    )}
  </div>
);

export default WizardHeader;
