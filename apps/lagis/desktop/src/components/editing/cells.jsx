import React from "react";

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
