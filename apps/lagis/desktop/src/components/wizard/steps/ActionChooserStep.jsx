import React from "react";
import { Radio, Space } from "antd";
import { ACTION_CHOICES } from "../../../core/wizard/constants";

/** Port of ChoiceActionPanel — the first screen of the Flurstück-Assistent. */
const ActionChooserStep = ({ value, onChange }) => (
  <Radio.Group
    value={value?.action}
    onChange={(event) => onChange({ action: event.target.value })}
  >
    <Space direction="vertical" size={6}>
      {ACTION_CHOICES.map((choice) => (
        <Radio key={choice.value} value={choice.value}>
          {choice.label}
        </Radio>
      ))}
    </Space>
  </Radio.Group>
);

export default ActionChooserStep;
