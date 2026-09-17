import React from "react";
import {
  CheckCircleOutlined,
  EditOutlined,
  FileAddOutlined,
  HistoryOutlined,
  MergeCellsOutlined,
  SplitCellsOutlined,
  SwapOutlined,
  TagOutlined,
} from "@ant-design/icons";
import { ACTION_CHOICES, WIZARD_ACTIONS } from "../../../core/wizard/constants";

const ICONS = {
  [WIZARD_ACTIONS.CREATE]: <FileAddOutlined />,
  [WIZARD_ACTIONS.RENAME]: <EditOutlined />,
  [WIZARD_ACTIONS.HISTORIC]: <HistoryOutlined />,
  [WIZARD_ACTIONS.ACTIVATE]: <CheckCircleOutlined />,
  [WIZARD_ACTIONS.SPLIT]: <SplitCellsOutlined />,
  [WIZARD_ACTIONS.JOIN]: <MergeCellsOutlined />,
  [WIZARD_ACTIONS.SPLIT_JOIN]: <SwapOutlined />,
  [WIZARD_ACTIONS.CHANGE_KIND]: <TagOutlined />,
};

/** Port of ChoiceActionPanel — the first screen of the Flurstück-Assistent. */
const ActionChooserStep = ({ value, onChange }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: 10,
    }}
  >
    {ACTION_CHOICES.map((choice) => {
      const selected = value?.action === choice.value;
      return (
        <div
          key={choice.value}
          role="radio"
          tabIndex={0}
          aria-checked={selected}
          onClick={() => onChange({ action: choice.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onChange({ action: choice.value });
            }
          }}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 8,
            cursor: "pointer",
            userSelect: "none",
            border: `1px solid ${selected ? "#1677ff" : "#e8e8e8"}`,
            background: selected ? "#f0f7ff" : "#fff",
            boxShadow: selected
              ? "0 0 0 2px rgba(22,119,255,0.10)"
              : "0 1px 2px rgba(0,0,0,0.03)",
            transition: "border-color .15s, background .15s, box-shadow .15s",
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 28px",
              width: 28,
              height: 28,
              borderRadius: 6,
              fontSize: 14,
              background: selected ? "#1677ff" : "#f2f4f7",
              color: selected ? "#fff" : "#6b7280",
            }}
          >
            {ICONS[choice.value]}
          </span>
          <span style={{ minWidth: 0 }}>
            <span
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                lineHeight: "18px",
                color: selected ? "#0958d9" : "#1f2937",
              }}
            >
              {choice.label}
            </span>
            <span
              style={{
                display: "block",
                fontSize: 12,
                lineHeight: "16px",
                color: "#8c8c8c",
                marginTop: 2,
              }}
            >
              {choice.description}
            </span>
          </span>
        </div>
      );
    })}
  </div>
);

export default ActionChooserStep;
