/*
Helper function to suppress React Cismap warnings and errors. until cismap is ported to TypeScript/React >18
*/
const REACT_CISMAP = "react-cismap";
const WARN_MESSAGE_PATTERNS = [
  "componentWillMount",
  "componentWillReceiveProps",
];
const LOG_INTERVAL = 100; // Log warning messages at 0 and every 100th occurrence
const LOG_MESSAGE =
  "console is actively suppressing legacy react-cismap warnings and errors";

export const suppressReactCismapErrors = () => {
  let suppressedCount = 0;
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.warn = (message, ...args) => {
    if (
      message &&
      WARN_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern))
    ) {
      if (suppressedCount % LOG_INTERVAL === 0) {
        originalWarn(LOG_MESSAGE);
      }
      suppressedCount++;
      return;
    }
    originalWarn(message, ...args);
  };

  console.error = (message, ...args) => {
    if (args.some((arg) => arg && arg.includes(REACT_CISMAP))) {
      if (suppressedCount % LOG_INTERVAL === 0) {
        originalError(LOG_MESSAGE);
      }
      suppressedCount++;
      return;
    }
    originalError(message, ...args);
  };
};
