import React from "react";
import { Alert, Modal, Steps } from "antd";
import {
  ExclamationCircleOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";

import GraphQLPanel from "./GraphQLPanel";

const PANE_STYLE = { height: "min(62vh, 520px)", minHeight: 380 };

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
  children,
}) => (
  <Modal
    open={open}
    title={header}
    width={880}
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

      {/* kept mounted rather than unmounted: the choosers hold the typed
          Flurstück in local state, which unmounting would discard */}
      <div
        style={{
          display: logsVisible ? "none" : "flex",
          height: "100%",
        }}
      >
        <div
          style={{
            width: 244,
            flex: "0 0 244px",
            background: "#fafafa",
            borderRight: "1px solid #f0f0f0",
            padding: "20px 16px",
            overflowY: "auto",
          }}
        >
          <Steps
            direction="vertical"
            size="small"
            current={stepIndex}
            items={steps.map((step) => ({
              title: <span style={{ fontSize: 13 }}>{step.title}</span>,
            }))}
          />
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
          <div>
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
                description={
                  <span style={{ whiteSpace: "pre-line" }}>
                    {result.message}
                  </span>
                }
              />
            ) : (
              children
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
          {problem && (
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
