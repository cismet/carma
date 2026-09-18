import React from "react";
import { Button, Space } from "antd";

const WizardFooter = ({
  result,
  busy,
  stepIndex,
  stepCount,
  showStepCount,
  isLast,
  canAdvance,
  onSwitchToResult,
  onClose,
  onBack,
  onNext,
  onFinish,
}) => {
  const buttons = result
    ? [
        onSwitchToResult && (
          <Button key="switch" type="primary" onClick={onSwitchToResult}>
            Zum Flurstück wechseln
          </Button>
        ),
        <Button key="close" onClick={onClose}>
          Schließen
        </Button>,
      ].filter(Boolean)
    : [
        <Button key="cancel" onClick={onClose} disabled={busy}>
          Abbrechen
        </Button>,
        <Button key="prev" onClick={onBack} disabled={stepIndex === 0 || busy}>
          Zurück
        </Button>,
        isLast ? (
          <Button
            key="finish"
            type="primary"
            loading={busy}
            disabled={!canAdvance}
            onClick={onFinish}
          >
            Fertigstellen
          </Button>
        ) : (
          <Button
            key="next"
            type="primary"
            loading={busy}
            disabled={!canAdvance}
            onClick={onNext}
          >
            Weiter
          </Button>
        ),
      ];

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-400" style={{ fontSize: 12 }}>
        {showStepCount ? `Schritt ${stepIndex + 1} von ${stepCount}` : ""}
      </span>
      <Space size={8}>{buttons}</Space>
    </div>
  );
};

export default WizardFooter;
