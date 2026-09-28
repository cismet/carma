import React from "react";
import { Alert, Modal, Steps } from "antd";
import {
  ExclamationCircleOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";

import GraphQLPanel from "./GraphQLPanel";
import ResultDescription from "./ResultDescription";

const groupSteps = (steps) => {
  const items = [];
  steps.forEach((step, index) => {
    const last = items[items.length - 1];
    if (step.group && last?.group === step.group) {
      last.children.push({ ...step, index });
    } else if (step.group) {
      items.push({ group: step.group, children: [{ ...step, index }] });
    } else {
      items.push({ ...step, index });
    }
  });
  return items;
};

const firstIndex = (item) => item.children?.[0].index ?? item.index;

const StepList = ({ steps, stepIndex }) => {
  const items = groupSteps(steps);
  const current = items.findLastIndex((item) => firstIndex(item) <= stepIndex);
  return (
    <Steps
      direction="vertical"
      size="small"
      current={current}
      items={items.map((item, itemIndex) => ({
        title: <span style={{ fontSize: 13 }}>{item.group ?? item.title}</span>,
        description: item.children && (
          <Steps
            className="mt-2"
            // the dots stick out to the left and the outer step clips them
            style={{ paddingInlineStart: 6 }}
            direction="vertical"
            size="small"
            progressDot
            current={
              itemIndex < current
                ? item.children.length
                : itemIndex > current
                ? -1
                : stepIndex - firstIndex(item)
            }
            items={item.children.map((child) => ({
              title: <span style={{ fontSize: 12 }}>{child.title}</span>,
            }))}
          />
        ),
      }))}
    />
  );
};

const PANE_STYLE = { height: "min(720px, calc(100vh - 160px))" };
const SIDEBAR_WIDTH = "clamp(180px, 20vw, 240px)";

const WizardModal = ({
  open,
  header,
  footer,
  onCancel,
  steps,
  stepIndex,
  stepTitle,
  showLogs,
  logsVisible,
  result,
  error,
  problem,
  problemTone = "info",
  hideProblem = false,
  children,
}) => (
  <Modal
    open={open}
    title={header}
    width={1200}
    centered
    onCancel={onCancel}
    maskClosable={false}
    footer={footer}
    styles={{
      content: { padding: 0, overflow: "hidden" },
      header: {
        padding: "16px 24px",
        marginBottom: 0,
        borderBottom: "1px solid #f0f0f0",
      },
      body: { padding: 0 },
      footer: {
        padding: "12px 24px",
        marginTop: 0,
        borderTop: "1px solid #f0f0f0",
        background: "#fafafa",
      },
    }}
  >
    <div style={PANE_STYLE}>
      {showLogs && (
        <div
          style={{
            display: logsVisible ? "block" : "none",
            height: "100%",
            overflow: "hidden",
            padding: "16px 24px",
          }}
        >
          <GraphQLPanel />
        </div>
      )}

      {/* kept mounted: the choosers hold typed input in local state */}
      <div
        style={{
          display: logsVisible ? "none" : "flex",
          height: "100%",
        }}
      >
        <div
          style={{
            width: SIDEBAR_WIDTH,
            flex: `0 0 ${SIDEBAR_WIDTH}`,
            background: "#f8fafc",
            borderRight: "1px solid #e5e7eb",
            padding: "20px 12px 20px 16px",
            overflowY: "auto",
          }}
        >
          <StepList steps={steps} stepIndex={stepIndex} />
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            padding: "20px 24px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {stepTitle && (
              <div
                style={{
                  marginBottom: 16,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {stepTitle}
              </div>
            )}
            {result ? (
              <Alert
                type="success"
                showIcon
                message="Aktion erfolgreich"
                description={<ResultDescription result={result} />}
              />
            ) : (
              <div
                style={{ flex: 1, display: "flex", flexDirection: "column" }}
              >
                {children}
              </div>
            )}
            {error && (
              <Alert
                className="mt-3"
                type="error"
                showIcon
                message="Die Aktion ist fehlgeschlagen"
                description={
                  <span style={{ whiteSpace: "pre-line" }}>{error}</span>
                }
              />
            )}
          </div>
          {problem && !hideProblem && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                marginTop: 16,
                fontSize: 13,
                padding: "8px 10px",
                borderRadius: 6,
                ...(problemTone === "error"
                  ? {
                      background: "#fff2f0",
                      border: "1px solid #ffccc7",
                      color: "#cf1322",
                    }
                  : {
                      background: "#f0f7ff",
                      border: "1px solid #d6e4ff",
                      color: "#1d4ed8",
                    }),
              }}
            >
              {problemTone === "error" ? (
                <ExclamationCircleOutlined style={{ marginTop: 3 }} />
              ) : (
                <InfoCircleOutlined style={{ marginTop: 3 }} />
              )}
              <span>{problem}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  </Modal>
);

export default WizardModal;
