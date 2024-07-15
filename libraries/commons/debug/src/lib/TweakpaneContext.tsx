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
import { hasHashParam, removeHashParam, removeParamFromString } from './utils';

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

  const disableTweakpane = () => {
    setIsEnabled(false);
    localForage.removeItem(localForageKey);
    removeHashParam(hashparam);
  };

  useEffect(() => {
    const checkHashAndStoredState = async () => {
      const isEnabledFromHash = hasHashParam(hashparam);
      if (isEnabledFromHash) {
        // If 'dev' is in the URL, enable debug view immediately
        console.log('Dev mode enabled from hash');
        setIsEnabled(true);
        await localForage.setItem(localForageKey, true);
      } else {
        // If 'dev' is not in the URL, check localForage
        const storedIsEnabled = await localForage.getItem(localForageKey);
        setIsEnabled(storedIsEnabled === true);
      }
    };

    checkHashAndStoredState();

    const toggleTweakpane = (event: KeyboardEvent) => {
      if (eventKeys.includes(event.key)) {
        // dev state should not be persited in URL when sharing
        setIsEnabled((prevState) => {
          const newState = !prevState;
          localForage.setItem(localForageKey, newState);
          newState === false && removeHashParam(hashparam);
          return newState;
        });
      }
    };
    window.addEventListener('keydown', toggleTweakpane);
    return () => {
      window.removeEventListener('keydown', toggleTweakpane);
    };
  }, [hashparam]);

  useEffect(() => {
    if (!paneRef.current && containerRef.current) {
      const pane = new Pane({
        title: 'Developer Options',
        container: containerRef.current,
      });
      paneRef.current = pane;

      const closeButton = pane.addButton({
        title: 'Close This Dev GUI',
        label: 'Toggle with F12 or ~',
      });
      closeButton.on('click', () => {
        disableTweakpane();
      });
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
