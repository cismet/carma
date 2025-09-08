import { useContext, useRef, useEffect, useCallback, useMemo } from "react";
import type { FolderApi, Pane, FolderParams } from "tweakpane";
import { DebugUiContext } from "../DebugUiContext";
import { setupTweakpane } from "./tweakpaneSetup";

interface Input {
  label?: string;
  name: string;
  [key: string]: unknown;
}

// specific hook for Tweakpane context
export const useTweakpaneCtx = ({
  folder,
  params = {},
  inputs = [],
}: {
  folder?: FolderParams;
  params?: { [key: string]: unknown };
  inputs?: Input[];
} = {}) => {
  const context = useContext(DebugUiContext);

  if (!context) {
    throw new Error("useTweakpaneCtx must be used within a DebugUiProvider");
  }

  const { paneRef } = context;

  const folderRef = useRef<FolderApi | null>(null);

  useEffect(() => {
    let isSetup = setupTweakpane(paneRef, folderRef, folder, params, inputs);

    if (!isSetup) {
      const intervalId = setInterval(() => {
        isSetup = setupTweakpane(paneRef, folderRef, folder, params, inputs);
        if (isSetup) {
          clearInterval(intervalId);
        }
      }, 500); // Check every 500ms

      return () => {
        clearInterval(intervalId);
      };
    }

    return () => {
      if (folderRef.current) {
        folderRef.current.hidden = true;
        folderRef.current.children.forEach((child) => {
          child.dispose();
        });
      }
    };
  }, [folder, params, inputs, paneRef]);

  const folderCallback = useCallback((fn: (folder: FolderApi) => void) => {
    if (folderRef.current) {
      fn(folderRef.current);
    } else {
      console.warn("Folder not initialized yet");
    }
  }, []);

  const paneCallback = useCallback(
    (fn: (pane: Pane) => void) => {
      if (paneRef.current) {
        fn(paneRef.current);
      } else {
        console.warn("Pane not initialized yet");
      }
    },
    [paneRef]
  );

  const value = useMemo(
    () => ({
      paneRef,
      paneCallback,
      folderRef,
      folderCallback,
    }),
    [paneRef, paneCallback, folderRef, folderCallback]
  );

  return value;
};
