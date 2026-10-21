import React, { useState } from "react";
import { DatePicker, Select } from "antd";

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

const cellPopup = (anchor) => {
  const cell = anchor?.closest("td")?.getBoundingClientRect();
  if (!cell) {
    return undefined;
  }
  const own = anchor.getBoundingClientRect();
  return {
    width: cell.width + 1,
    offset: [cell.left - 1 - own.left, cell.bottom - own.bottom + 1],
  };
};

// narrower and the day grid gets cramped
const MIN_CALENDAR_WIDTH = 180;

export const CellSelect = ({ onMouseDown, onFocus, ...props }) => {
  const [popup, setPopup] = useState();
  const measure = (event) => setPopup(cellPopup(event.currentTarget));
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

// rc-picker reads popupAlign, not dropdownAlign
export const CellDatePicker = ({ onFocus, ...props }) => {
  const [popup, setPopup] = useState();
  return (
    <DatePicker
      {...props}
      popupClassName="sheet-calendar"
      popupStyle={
        popup && {
          "--sheet-calendar-width": `${Math.max(
            MIN_CALENDAR_WIDTH,
            popup.width
          )}px`,
        }
      }
      popupAlign={popup && { offset: popup.offset }}
      onFocus={(event, info) => {
        setPopup(cellPopup(event.target.closest(".ant-picker")));
        onFocus?.(event, info);
      }}
    />
  );
};
