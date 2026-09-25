import React from "react";
import { Button, Space, Tooltip } from "antd";
import { MinusOutlined, PlusOutlined } from "@ant-design/icons";

/** Add / remove buttons for the editable wizard tables. */
const RowActionButtons = ({ onAdd, onRemove, removeDisabled }) => (
  <Space size={4}>
    <Tooltip title="Zeile hinzufügen">
      <Button size="small" icon={<PlusOutlined />} onClick={onAdd} />
    </Tooltip>
    <Tooltip title="Ausgewählte Zeile entfernen">
      <Button
        size="small"
        icon={<MinusOutlined />}
        onClick={onRemove}
        disabled={removeDisabled}
      />
    </Tooltip>
  </Space>
);

export default RowActionButtons;
