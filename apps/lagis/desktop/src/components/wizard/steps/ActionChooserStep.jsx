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

const ActionChooserStep = ({ value, onChange }) => (
  <div
    role="radiogroup"
    className="grid gap-3"
    style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
  >
    {ACTION_CHOICES.map((choice) => {
      const selected = value?.action === choice.value;
      return (
        <button
          key={choice.value}
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={() => onChange({ action: choice.value })}
          className={`group flex items-start gap-3 w-full text-left rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
            selected
              ? "border-blue-500 bg-blue-50 shadow-[0_0_0_3px_rgba(22,119,255,0.12)]"
              : "border-gray-200 bg-white shadow-sm hover:border-blue-400 hover:bg-blue-50"
          }`}
        >
          <span
            className={`flex flex-none items-center justify-center w-9 h-9 rounded-lg text-base transition-colors ${
              selected
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-blue-600"
            }`}
          >
            {ICONS[choice.value]}
          </span>
          <span className="min-w-0">
            <span
              className={`block text-sm font-medium leading-5 ${
                selected ? "text-blue-700" : "text-gray-800"
              }`}
            >
              {choice.label}
            </span>
            <span className="block text-xs leading-4 text-gray-500 mt-1">
              {choice.description}
            </span>
          </span>
        </button>
      );
    })}
  </div>
);

export default ActionChooserStep;
