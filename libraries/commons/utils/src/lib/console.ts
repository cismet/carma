export const logOnce = (() => {
  const logged = new Set<string>();
  return (message: string) => {
    if (!logged.has(message)) {
      console.info(message);
      logged.add(message);
    }
  };
})();
