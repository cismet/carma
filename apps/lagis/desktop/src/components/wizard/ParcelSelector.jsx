import React from "react";
import { Tag } from "antd";
import { formatKey } from "../../core/wizard/keys";

export const activeTarget = (targets, activeParcel) =>
  targets.find(({ key }) => formatKey(key) === activeParcel) ?? targets[0];

const ParcelSelector = ({ targets, value, onChange }) =>
  targets.length > 1 ? (
    <div className="flex flex-wrap gap-y-2">
      {targets.map(({ key }) => {
        const label = formatKey(key);
        return (
          <Tag
            key={label}
            color={label === value ? "blue" : undefined}
            className="cursor-pointer"
            onClick={() => onChange(label)}
          >
            {label}
          </Tag>
        );
      })}
    </div>
  ) : null;

export default ParcelSelector;
