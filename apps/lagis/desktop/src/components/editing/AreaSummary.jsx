import React from "react";
import { Alert } from "antd";
import { planarArea } from "../../core/wizard/geometry";

const formatArea = (area) =>
  `${Number(area).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m²`;

const AreaSummary = ({ parcelArea, rows }) => {
  const missing = rows.filter((row) => !row.geometry).length;
  const sum = rows.reduce(
    (total, row) => total + (row.geometry ? planarArea(row.geometry) : 0),
    0
  );
  const differs =
    parcelArea !== undefined && Math.abs(parcelArea - sum) >= 0.01;
  const text = [
    parcelArea !== undefined && `Flurstück: ${formatArea(parcelArea)}`,
    `Verwaltungsbereiche: ${formatArea(sum)}`,
    missing > 0 &&
      `${missing} ${
        missing === 1 ? "Bereich" : "Bereiche"
      } noch nicht gezeichnet`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Alert
      type={differs || missing > 0 ? "warning" : "success"}
      showIcon
      style={{ padding: "4px 12px" }}
      message={text}
    />
  );
};

export default AreaSummary;
