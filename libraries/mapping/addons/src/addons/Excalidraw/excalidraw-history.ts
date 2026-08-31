// excalidraw exposes no undo/redo, only history.clear, so this replays the
// shortcut it listens for. Both modifiers: its keyTest reads CTRL_OR_CMD, which
// is metaKey on mac and ctrlKey elsewhere
const sendHistoryKey = (container: HTMLElement | null, shiftKey: boolean) => {
  container?.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      metaKey: true,
      shiftKey,
    })
  );
};

export const undoScene = (container: HTMLElement | null) =>
  sendHistoryKey(container, false);

export const redoScene = (container: HTMLElement | null) =>
  sendHistoryKey(container, true);
