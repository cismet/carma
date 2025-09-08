import type { MutableRefObject, RefObject } from "react";
import type { FolderApi, Pane, FolderParams } from "tweakpane";

export interface TweakpaneInput {
  label?: string;
  name: string;
  [key: string]: unknown;
}

export function setupTweakpane(
  paneRef: RefObject<Pane | null>,
  folderRef: MutableRefObject<FolderApi | null>,
  folder: FolderParams | undefined,
  params: { [key: string]: unknown },
  inputs: TweakpaneInput[]
): boolean {
  if (!paneRef.current) return false;

  const isHidden = paneRef.current.element.parentElement?.hidden === true;
  if (isHidden) return false;

  if (folder) {
    if (folderRef.current) {
      folderRef.current.hidden = false;
      console.debug("HOOK: [TWEAKPANE|DEBUG] using existing folder");
    } else {
      console.debug("HOOK: [TWEAKPANE|DEBUG] adding new folder to pane");
      folderRef.current = paneRef.current.addFolder(folder);
    }

    if (folderRef.current.children.length > 0) {
      folderRef.current.children.forEach((child) => {
        child.dispose();
      });
    }

    inputs.forEach((input) => {
      folderRef.current &&
        folderRef.current.addBinding(params, input.name, input);
    });
  } else {
    console.debug(
      "[TWEAKPANE|DEBUG] Folder params not provided, using root folder"
    );

    inputs.forEach((input) => {
      paneRef.current && paneRef.current.addBinding(params, input.name, input);
    });
  }

  return true;
}
