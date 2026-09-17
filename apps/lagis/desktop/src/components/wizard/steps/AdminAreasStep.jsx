import React, { useEffect } from "react";
import { Alert } from "antd";

/** Placeholder: the Verwaltungsbereiche of the parcels the action touches. */
const AdminAreasStep = ({ onProblem }) => {
  useEffect(() => {
    onProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Alert
      type="info"
      showIcon
      message="Verwaltungsbereiche"
      description="Dieser Schritt wurde noch nicht umgesetzt"
    />
  );
};

export default AdminAreasStep;
