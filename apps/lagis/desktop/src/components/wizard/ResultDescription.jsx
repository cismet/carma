import React from "react";
import KeyRow, { KeyTag } from "./KeyRow";

// a message may mix text with keys, which are shown as tags
const Message = ({ message, onSelectKey }) =>
  Array.isArray(message) ? (
    <span>
      {message.map((part, index) =>
        typeof part === "string" ? (
          part
        ) : (
          <KeyTag key={index} value={part} onSelect={onSelectKey} />
        )
      )}
    </span>
  ) : (
    <span style={{ whiteSpace: "pre-line" }}>{message}</span>
  );

const ResultDescription = ({ result, onSelectKey }) => (
  <div className="flex flex-col gap-2">
    <Message message={result.message} onSelectKey={onSelectKey} />
    {result.from && result.to && (
      <div
        className="items-center gap-x-3 gap-y-1"
        style={{ display: "grid", gridTemplateColumns: "auto 1fr" }}
      >
        <KeyRow label="Vorher" keys={result.from} onSelect={onSelectKey} />
        <KeyRow label="Nachher" keys={result.to} onSelect={onSelectKey} />
      </div>
    )}
  </div>
);

export default ResultDescription;
