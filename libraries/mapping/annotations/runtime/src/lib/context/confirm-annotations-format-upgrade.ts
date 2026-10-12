import { Modal } from "antd";

export const confirmAnnotationsFormatUpgrade = (): Promise<boolean> =>
  new Promise((resolve) => {
    Modal.confirm({
      title: "Gespeicherte 3D-Messungen",
      content:
        "Diese Messungen verwenden ein älteres Speicherformat. Möchten Sie sie auf das aktuelle Format aktualisieren oder lokal im bisherigen Format weiterspeichern? Geometrie und Messwerte bleiben erhalten.",
      okText: "Aktualisieren",
      cancelText: "Bisheriges Format behalten",
      maskClosable: false,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
