export const logOnce = (() => {
  const logged = new Set<string>();
  return (message: string) => {
    if (!logged.has(message)) {
      console.info(message);
      logged.add(message);
    }
  };
})();

export const warnOnce = (() => {
  const warned = new Set<string>();
  return (message: string) => {
    if (!warned.has(message)) {
      console.warn(message);
      warned.add(message);
    }
  };
})();
