import React, { useState } from "react";
import { Tag } from "antd";
import { formatKey } from "../../core/wizard/keys";

const HOVER_STYLE = {
  color: "#1677ff",
  borderColor: "#1677ff",
};

export const KeyTag = ({ value, onSelect }) => {
  const [hovered, setHovered] = useState(false);
  // pseudo keys have no Gemarkung and can't be opened
  const clickable = Boolean(onSelect && value.gemarkung);
  return (
    <Tag
      className="m-0"
      style={
        clickable
          ? {
              cursor: "pointer",
              transition: "color 0.2s, border-color 0.2s",
              ...(hovered ? HOVER_STYLE : {}),
            }
          : undefined
      }
      title={clickable ? "Zum Flurstück wechseln" : undefined}
      onClick={clickable ? () => onSelect(value) : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {formatKey(value)}
    </Tag>
  );
};

const KeyRow = ({ label, keys, onSelect }) => (
  <>
    <span className="text-gray-500">{label}</span>
    <div className="flex flex-wrap gap-1">
      {keys.map((key) => (
        <KeyTag key={formatKey(key)} value={key} onSelect={onSelect} />
      ))}
    </div>
  </>
);

export default KeyRow;
