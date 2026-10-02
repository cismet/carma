import React, { useEffect, useState } from "react";
import { Progress } from "antd";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  CloudUploadOutlined,
  LoadingOutlined,
  MinusCircleOutlined,
  UndoOutlined,
} from "@ant-design/icons";

const formatElapsed = (ms) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const useElapsed = (running) => {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    if (!running) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [running]);
  return now - startedAt;
};

const PHASE_ICON = {
  pending: (
    <span
      style={{
        display: "block",
        width: 12,
        height: 12,
        borderRadius: "50%",
        border: "2px solid #d9d9d9",
      }}
    />
  ),
  active: <LoadingOutlined style={{ color: "#1677ff", fontSize: 16 }} />,
  done: <CheckCircleFilled style={{ color: "#52c41a", fontSize: 16 }} />,
  skipped: <MinusCircleOutlined style={{ color: "#bfbfbf", fontSize: 16 }} />,
  error: <CloseCircleFilled style={{ color: "#ff4d4f", fontSize: 16 }} />,
};

const phaseCaption = (phase) => {
  if (phase.status === "skipped") {
    return "Keine Änderungen";
  }
  if (phase.total) {
    return `${phase.done} von ${phase.total}`;
  }
  if (phase.status === "active" || phase.status === "done") {
    return `${phase.requests} Serveranfrage${phase.requests === 1 ? "" : "n"}`;
  }
  return "";
};

const Phase = ({ phase }) => {
  const active = phase.status === "active";
  return (
    <div
      className="flex items-start gap-3"
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        background: active ? "#f0f7ff" : "transparent",
        border: `1px solid ${active ? "#d6e4ff" : "transparent"}`,
        transition: "background 200ms, border-color 200ms",
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{ width: 18, height: 22 }}
      >
        {PHASE_ICON[phase.status]}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className="flex items-baseline justify-between gap-3"
          style={{ lineHeight: "22px" }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              color: phase.status === "pending" ? "#8c8c8c" : "#1f1f1f",
            }}
          >
            {phase.title}
          </span>
          <span
            className="tabular-nums"
            style={{ fontSize: 12, color: "#8c8c8c", whiteSpace: "nowrap" }}
          >
            {phaseCaption(phase)}
          </span>
        </div>
        {active && phase.total > 0 && (
          <Progress
            className="mb-0"
            percent={Math.round((phase.done / phase.total) * 100)}
            showInfo={false}
            size="small"
            strokeColor="#91caff"
          />
        )}
        {active && phase.detail && (
          <div
            className="truncate"
            style={{ fontSize: 12, color: "#595959", marginTop: 2 }}
          >
            {phase.detail}
          </div>
        )}
      </div>
    </div>
  );
};

const SaveProgress = ({ progress }) => {
  const { rollingBack, failed } = progress;
  const elapsed = useElapsed(!failed || rollingBack);

  const headline = rollingBack
    ? "Änderungen werden zurückgenommen"
    : failed
    ? "Speichern fehlgeschlagen"
    : "Änderungen werden gespeichert";

  return (
    // bottom padding lifts the block above the true center, which reads as centered
    <div
      className="flex flex-1 items-center justify-center"
      style={{ paddingBottom: "8%" }}
    >
      <div style={{ width: "min(520px, 100%)" }}>
        <div className="flex items-center gap-4 mb-5">
          <div
            className="flex items-center justify-center"
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: failed ? "#fff2f0" : "#e6f4ff",
              color: failed ? "#cf1322" : "#1677ff",
              fontSize: 24,
            }}
          >
            {rollingBack ? <UndoOutlined spin /> : <CloudUploadOutlined />}
          </div>
          <div className="flex-1">
            <div style={{ fontSize: 16, fontWeight: 600 }}>{headline}</div>
            <div style={{ fontSize: 12, color: "#8c8c8c" }}>
              Bitte schließen Sie den Assistenten nicht, bis der Vorgang
              abgeschlossen ist.
            </div>
          </div>
          <div
            className="tabular-nums"
            style={{ fontSize: 20, fontWeight: 600, color: "#595959" }}
            title="Verstrichene Zeit"
          >
            {formatElapsed(elapsed)}
          </div>
        </div>

        <Progress
          percent={progress.percent}
          status={failed ? "exception" : "active"}
          strokeColor={failed ? undefined : { from: "#69b1ff", to: "#1677ff" }}
          strokeWidth={10}
        />
        <div className="flex flex-col gap-1" style={{ margin: "16px -12px 0" }}>
          {progress.phases.map((phase) => (
            <Phase key={phase.id} phase={phase} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SaveProgress;
