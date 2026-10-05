import React from "react";
import { Button, Space, Tooltip } from "antd";
import { MinusOutlined, PlusOutlined } from "@ant-design/icons";

// minusOffset: px to move the − down where the block sits on a half pixel
const RowActionButtons = ({
  onAdd,
  onRemove,
  removeDisabled,
  minusOffset = 0,
}) => (
  <Space size={4}>
    <Tooltip title="Zeile hinzufügen">
      <Button size="small" icon={<PlusOutlined />} onClick={onAdd} />
    </Tooltip>
    <Tooltip title="Ausgewählte Zeile entfernen">
      <Button
        size="small"
        icon={
          <MinusOutlined
            style={
              minusOffset
                ? { position: "relative", top: minusOffset }
                : undefined
            }
          />
        }
        onClick={onRemove}
        disabled={removeDisabled}
      />
    </Tooltip>
  </Space>
);

export default RowActionButtons;
