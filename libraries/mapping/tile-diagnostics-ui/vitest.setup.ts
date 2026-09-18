if (typeof window !== "undefined") {
  window.URL.createObjectURL ??= () => "";
  window.URL.revokeObjectURL ??= () => undefined;
}
