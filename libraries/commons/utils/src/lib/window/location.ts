function reload(): void {
  try {
    window.location.reload();
  } catch {
    // no-op in non-browser/test
  }
}

export const carmaWindowLocation = {
  reload,
};
