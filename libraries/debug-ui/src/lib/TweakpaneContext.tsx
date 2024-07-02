import React, {
  createContext,
  useContext,
  useRef,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { FolderApi, Pane } from 'tweakpane';
import localForage from 'localforage';

interface TweakpaneContextType {
  //isEnabled: boolean;
  paneRef: React.RefObject<Pane | null>;
}

const eventKeys = ['~', 'F12']; //
const localForageKey = 'tweakpaneEnabled';

const TweakpaneContext = createContext<TweakpaneContextType | null>(null);

interface Input {
  label?: string;
  name: string;
  [key: string]: unknown;
}

interface FolderConfig {
  title: string;
  expanded?: boolean;
}

export const useTweakpaneCtx = (
  folderConfig: FolderConfig,
  params: { [key: string]: unknown },
  inputs: Input[]
) => {
  const context = useContext(TweakpaneContext);
  const folderRef = useRef<FolderApi | null>(null);

  if (!context) {
    throw new Error('useTweakpane must be used within a TweakpaneProvider');
  }

  const pane = context.paneRef.current;

  useEffect(() => {
    if (!pane) return;
    folderRef.current = pane.addFolder(folderConfig);
    inputs.forEach((input) => {
      folderRef.current &&
        folderRef.current.addBinding(params, input.name, input);
    });

    return () => {
      folderRef.current && folderRef.current.dispose();
      folderRef.current = null;
    };
  }, [folderConfig, params, inputs, pane]);

  const folderCallback = (fn: (folder: FolderApi) => void) => {
    if (folderRef.current) {
      fn(folderRef.current);
    } else {
      console.warn('Folder not initialized yet');
    }
  };

  return { folderRef, folderCallback };
};

const TweakpaneProvider: React.FC<{
  children: ReactNode;
  hashparam?: string;
}> = ({ children, hashparam = 'dev' }) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<Pane | null>(null);

  useEffect(() => {
    const checkHashAndStoredState = async () => {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const isEnabledFromHash = hashParams.has(hashparam);
      const storedIsEnabled = await localForage.getItem(localForageKey);

      const newIsEnabled = isEnabledFromHash || storedIsEnabled === true;
      setIsEnabled(newIsEnabled);
      await localForage.setItem(localForageKey, newIsEnabled);
    };

    checkHashAndStoredState();

    // Define the function to toggle isEnabled state within useEffect
    const toggleTweakpane = (event: KeyboardEvent) => {
      if (eventKeys.includes(event.key)) {
        setIsEnabled((prevState) => {
          localForage.setItem(localForageKey, !prevState);
          return !prevState;
        });
      }
    };

    // Add event listener for keydown
    window.addEventListener('keydown', toggleTweakpane);

    // Cleanup function to remove the event listener
    return () => {
      window.removeEventListener('keydown', toggleTweakpane);
    };
  }, [hashparam]);

  useEffect(() => {
    if (!paneRef.current && containerRef.current) {
      const pane = new Pane({
        title: 'Debug Options',
        container: containerRef.current,
      });
      paneRef.current = pane;
    }

    return () => {
      if (paneRef.current) {
        paneRef.current.dispose();
        paneRef.current = null;
      }
    };
  }, [containerRef]);

  return (
    <TweakpaneContext.Provider value={{ paneRef }}>
      <div
        ref={containerRef}
        id="tweakpane-container"
        style={{
          position: 'absolute',
          display: isEnabled ? 'block' : 'none',
          top: 10,
          left: 45,
          zIndex: 10000,
        }}
      ></div>

      {children}
    </TweakpaneContext.Provider>
  );
};

export {
  //useTweakpane,
  TweakpaneProvider,
};

export default TweakpaneProvider;
