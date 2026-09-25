import React from "react";
import { Tag } from "antd";
import { formatKey } from "../../core/wizard/keys";

const KeyRow = ({ label, keys }) => (
  <>
    <span className="text-gray-500">{label}</span>
    <div className="flex flex-wrap gap-1">
      {keys.map((key) => (
        <Tag key={formatKey(key)} className="m-0">
          {formatKey(key)}
        </Tag>
      ))}
    </div>
  </>
);

export default KeyRow;
