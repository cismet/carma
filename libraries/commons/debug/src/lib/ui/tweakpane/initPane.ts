import { Pane } from "tweakpane";

export function createTweakpane(
  container: HTMLDivElement,
  onToggle: () => void
): Pane {
  const pane = new Pane({
    title: "Developer Options",
    container,
  });

  const closeButton = pane.addButton({
    title: "Close This Dev GUI",
    label: "Toggle with F1 or ~",
  });
  closeButton.on("click", onToggle);

  return pane;
}

export function disposeTweakpane(pane: Pane | null | undefined) {
  pane?.dispose();
}
