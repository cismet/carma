import React from "react";
import KeyRow from "./KeyRow";

const ResultDescription = ({ result }) => (
  <div className="flex flex-col gap-2">
    <span style={{ whiteSpace: "pre-line" }}>{result.message}</span>
    {result.from && result.to && (
      <div
        className="items-center gap-x-3 gap-y-1"
        style={{ display: "grid", gridTemplateColumns: "auto 1fr" }}
      >
        <KeyRow label="Vorher" keys={result.from} />
        <KeyRow label="Nachher" keys={result.to} />
      </div>
    )}
  </div>
);

export default ResultDescription;
