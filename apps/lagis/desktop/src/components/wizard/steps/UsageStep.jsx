import React, { useEffect } from "react";
import { Alert } from "antd";

/** Placeholder: the Nutzung of the parcels the action touches. */
const UsageStep = ({ onProblem }) => {
  useEffect(() => {
    onProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Alert
      type="info"
      showIcon
      message="Nutzung"
      description="Dieser Schritt wurde noch nicht umgesetzt"
    />
  );
};

export default UsageStep;
