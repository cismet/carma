import React, { useEffect, useState } from "react";
import { Button, Empty, Tag } from "antd";
import RawBlock from "./RawBlock";
import { clearLog, getEntries, subscribe } from "../../core/wizard/gqlLog";

const formatJson = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch (e) {
    return String(value);
  }
};

const timeOf = (date) =>
  date.toLocaleTimeString("de-DE", { hour12: false }) +
  "." +
  String(date.getMilliseconds()).padStart(3, "0");

const StatusTag = ({ entry }) => {
  if (entry.status === "pending") {
    return <Tag color="processing">läuft</Tag>;
  }
  if (entry.status === "error") {
    return <Tag color="error">Fehler</Tag>;
  }
  return <Tag color="success">OK</Tag>;
};

/**
 * Every server call the Assistent has made, newest first — the document or
 * request body, its parameters and the server's answer.
 *
 * Reads are GraphQL; writes are cids SaveObject/DeleteObject, so the two show
 * up side by side here and the tag says which is which.
 *
 * The point is the failing call: the document shown here is the exact text
 * that was posted, so a schema mismatch can be read off without opening the
 * Network tab.
 */
const GraphQLPanel = () => {
  const [entries, setEntries] = useState(getEntries);

  useEffect(() => subscribe(setEntries), []);

  return (
    <div
      className="flex flex-col gap-3 w-full"
      style={{ height: "100%", minHeight: 0 }}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {entries.length === 0
            ? "Noch keine Aufrufe"
            : `${entries.length} Aufruf${
                entries.length === 1 ? "" : "e"
              }, neueste zuerst`}
        </div>
        <Button size="small" onClick={clearLog} disabled={entries.length === 0}>
          Leeren
        </Button>
      </div>

      {entries.length === 0 ? (
        <Empty
          description="Sobald der Assistent Daten lädt oder schreibt, erscheinen die Abfragen hier."
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <div
          className="flex flex-col gap-3 overflow-y-auto pr-1"
          style={{ flex: 1, minHeight: 0 }}
        >
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="border border-gray-200 rounded p-3 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Tag color={entry.kind === "query" ? "blue" : "volcano"}>
                  {entry.kind}
                </Tag>
                <span className="font-medium">{entry.operation}</span>
                <StatusTag entry={entry} />
                <span className="text-xs text-gray-400 ml-auto">
                  {timeOf(entry.at)}
                  {entry.ms !== undefined && ` · ${entry.ms} ms`}
                </span>
              </div>

              {entry.message && (
                <div className="text-sm text-red-600">{entry.message}</div>
              )}

              <RawBlock>{entry.query.trim()}</RawBlock>

              <details>
                <summary className="text-xs text-gray-500 cursor-pointer">
                  Variablen
                </summary>
                <div className="mt-2">
                  <RawBlock maxHeight={200}>
                    {formatJson(entry.variables)}
                  </RawBlock>
                </div>
              </details>

              {entry.response !== undefined && (
                <details open={entry.status === "error"}>
                  <summary className="text-xs text-gray-500 cursor-pointer">
                    Antwort
                  </summary>
                  <div className="mt-2">
                    <RawBlock maxHeight={200}>
                      {formatJson(entry.response)}
                    </RawBlock>
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GraphQLPanel;
