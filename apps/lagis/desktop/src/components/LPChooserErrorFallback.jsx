import { useEffect, useState } from "react";
import StackTrace from "stacktrace-js";

const LPChooserErrorFallback = ({ error, resetErrorBoundary }) => {
  const br = "\n";
  const [errorStack, setErrorStack] = useState({
    errorStack: undefined,
    stringifiedStack: undefined,
  });

  useEffect(() => {
    StackTrace.fromError(error).then((errorStack) => {
      const stringifiedStack = errorStack
        .map(function (sf) {
          return sf.toString();
        })
        .join("\n");
      setErrorStack({ errorStack, stringifiedStack });
    });
  }, [error]);

  return (
    <div
      style={{
        backgroundColor: "white",
        width: "100%",
        height: "100%",
      }}
    >
      <h2>Es ist ein Fehler aufgetreten. Das tut uns leid. ¯\_(ツ)_/¯</h2>
    </div>
  );
};

export default LPChooserErrorFallback;
