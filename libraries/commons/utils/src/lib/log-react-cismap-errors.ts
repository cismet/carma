/*
Helper function to suppress React Cismap warnings and errors. until cismap is ported to TypeScript/React >18
*/
const KNOWN_WARNINGS_PATTERNS = [
  "componentWillMount",
  "componentWillReceiveProps",
  "ReactDOM.render is no longer supported",
  "switch-to-createroot",
];

// TODO fixable in react-cismap or low priority an likely obsolete when porting cismap:"\
const KNOWN_ERRORS_PATTERN = [
  "Warning: Failed prop type: LoadingOverlayWrapper2: prop type `styles.content` is invalid; it must be a function, usually from the `prop-types` package, but received `undefined`.",
  "Warning: GenericModalApplicationMenu: Support for defaultProps will be removed from function components in a future major release. Use JavaScript default parameters instead.",
  "Warning: ReactDOM.render is no longer supported in React 18. Use createRoot instead. Until you switch to the new API, your app will behave as if it's running React 17. Learn more: https://reactjs.org/link/switch-to-createroot",
  "Warning: Control5 uses the legacy contextTypes API which is no longer supported and will be removed in the next major release. Use React.createContext() with static contextType instead.",
];

const LOG_INTERVAL = 20; // Log warning messages at 0 and every 100th occurrence
const LOG_MESSAGE =
  "Suppressing legacy react-cismap warnings (React 18 compatibility)";

export const suppressReactCismapErrors = () => {
  let suppressedCount = 0;
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.warn = (message, ...args) => {
    const allContent = [message, ...args].join(" ");
    if (
      KNOWN_WARNINGS_PATTERNS.some((pattern) => allContent.includes(pattern))
    ) {
      if (suppressedCount % LOG_INTERVAL === 0) {
        console.info(LOG_MESSAGE);
      }
      suppressedCount++;
      return;
    }
    originalWarn(message, ...args);
  };

  console.error = (message, ...args) => {
    const allContent = [message, ...args].join(" ");

    // Check for react-cismap errors or known error patterns
    if (KNOWN_ERRORS_PATTERN.some((pattern) => allContent.includes(pattern))) {
      if (suppressedCount % LOG_INTERVAL === 0) {
        console.info(LOG_MESSAGE);
      }
      suppressedCount++;
      return;
    }
    originalError(message, ...args);
  };
};
