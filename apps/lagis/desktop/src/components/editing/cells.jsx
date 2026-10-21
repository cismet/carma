import React, { useState } from "react";
import { Select } from "antd";

export const dienststelleLabel = (dienststelle) =>
  dienststelle
    ? `${dienststelle.ressort?.abkuerzung}.${dienststelle.abkuerzung_abteilung}`
    : "";

export const ColorMark = ({ color }) => (
  <span
    style={{
      flex: "none",
      width: "9px",
      height: "11px",
      marginRight: "6px",
      backgroundColor: color || "transparent",
    }}
  ></span>
);

// a Select whose dropdown hangs under its table cell, border to border
export const CellSelect = ({ onMouseDown, onFocus, ...props }) => {
  const [popup, setPopup] = useState();
  const measure = (event) => {
    const select = event.currentTarget.getBoundingClientRect();
    const cell = event.currentTarget.closest("td")?.getBoundingClientRect();
    if (cell) {
      setPopup({
        width: cell.width + 1,
        offset: [cell.left - 1 - select.left, cell.bottom - select.bottom + 1],
      });
    }
  };
  return (
    <Select
      {...props}
      popupMatchSelectWidth={popup?.width ?? true}
      dropdownAlign={popup && { offset: popup.offset }}
      onMouseDown={(event) => {
        measure(event);
        onMouseDown?.(event);
      }}
      onFocus={(event) => {
        measure(event);
        onFocus?.(event);
      }}
    />
  );
};
