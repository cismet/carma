import { Tag } from "antd";
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
    <Tag
      closeIcon
      color="red"
      onClose={() => resetErrorBoundary()}
      className="mr-0 text-sm h-8 flex items-center"
    >
      <span>
        Wir konnten die Flurstücksdaten nicht laden. Bitte versuchen Sie es noch
        einmal
      </span>
    </Tag>
  );
};

export default LPChooserErrorFallback;
