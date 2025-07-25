import React, { useState, useEffect } from "react";
import { Modal, Button } from "antd";
import { useCesiumContext } from "@carma-mapping/cesium-engine";

interface CesiumErrorHandlerProps {
  children: React.ReactNode;
  onDisable: (permanent: boolean) => void;
  fallbackComponent?: React.ReactNode;
}

export const Cesium3DErrorHandler: React.FC<CesiumErrorHandlerProps> = ({
  children,
  onDisable,
  fallbackComponent,
}) => {
  const { isCesiumDisabled, setIsCesiumDisabled } = useCesiumContext();

  const [errorState, setErrorState] = useState<{
    hasError: boolean;
    showModal: boolean;
    isDisabled: boolean;
  }>({
    hasError: false,
    showModal: false,
    isDisabled: isCesiumDisabled,
  });

  useEffect(() => {
    setErrorState((prev) => ({ ...prev, isDisabled: isCesiumDisabled }));
    if (isCesiumDisabled) {
      onDisable(true);
    }
  }, [isCesiumDisabled, onDisable]);

  const handlePermanentDisable = () => {
    setIsCesiumDisabled(true, true);
    setErrorState((prev) => ({
      ...prev,
      isDisabled: true,
      showModal: false,
    }));
    onDisable(true);
  };

  const handleSessionDisable = () => {
    setIsCesiumDisabled(true, false);
    setErrorState((prev) => ({
      ...prev,
      isDisabled: true,
      showModal: false,
    }));
    onDisable(false);
  };

  const handleError = (error: Error) => {
    console.error("3D Component Error:", error);
    setErrorState({
      hasError: true,
      showModal: true,
      isDisabled: true,
    });
    onDisable(false);
  };

  if (errorState.isDisabled) {
    return (
      <>
        {fallbackComponent || (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              backgroundColor: "rgba(0,0,0,0.1)",
              color: "#666",
              fontSize: "16px",
            }}
          >
            3D-Modus ist für diese Sitzung deaktiviert
          </div>
        )}

        <Modal
          title="3D-Komponente Fehler"
          open={errorState.showModal}
          onCancel={() =>
            setErrorState((prev) => ({ ...prev, showModal: false }))
          }
          footer={[
            <Button key="session" onClick={handleSessionDisable}>
              Nur für diese Sitzung deaktivieren
            </Button>,
            <Button
              key="permanent"
              type="primary"
              danger
              onClick={handlePermanentDisable}
            >
              Dauerhaft deaktivieren
            </Button>,
          ]}
          closable={true}
          maskClosable={false}
        >
          <p>
            Die 3D-Kartenkomponente ist aufgrund eines technischen Fehlers
            abgestürzt. Sie können den 3D-Modus für diese Sitzung deaktivieren
            oder dauerhaft ausschalten.
          </p>
          <p>
            <strong>Nur für diese Sitzung:</strong> 3D wird beim nächsten Laden
            der Seite wieder verfügbar sein.
          </p>
          <p>
            <strong>Dauerhaft deaktivieren:</strong> 3D bleibt deaktiviert, bis
            Sie es in den Einstellungen wieder aktivieren.
          </p>
        </Modal>
      </>
    );
  }

  return (
    <Cesium3DErrorBoundary onError={handleError}>
      {children}
    </Cesium3DErrorBoundary>
  );
};

// Error Boundary Component
interface Cesium3DErrorBoundaryProps {
  children: React.ReactNode;
  onError: (error: Error) => void;
}

interface Cesium3DErrorBoundaryState {
  hasError: boolean;
}

class Cesium3DErrorBoundary extends React.Component<
  Cesium3DErrorBoundaryProps,
  Cesium3DErrorBoundaryState
> {
  constructor(props: Cesium3DErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): Cesium3DErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            backgroundColor: "rgba(255,0,0,0.1)",
            color: "#d32f2f",
            fontSize: "16px",
          }}
        >
          3D-Komponente konnte nicht geladen werden
        </div>
      );
    }

    return this.props.children;
  }
}

export default Cesium3DErrorHandler;
