import React, {
  createContext,
  useContext,
  useRef,
  useEffect,
  useState,
  ReactNode,
  RefObject,
} from 'react';
import { Pane } from 'tweakpane';

// Assuming Pane has the addFolder method directly. If not, adjust accordingly.
function createApi(containerRef: RefObject<HTMLDivElement>, title?: string) {
  let pane;
  /*
  const initPane = () => {
    if (containerRef.current) {
      // Check if createTestWindow is defined, indicating a test environment
      const doc = containerRef.current;
      pane = new Pane({ container: doc, title: title });
    }
  };

  const addFolder = (name) => {
    initPane();
    if (pane) {
      return pane.addFolder({ title: name });
    }
  };

  const dispose = () => {
    if (pane) {
      pane.dispose();
      pane = null;
    }
  };
  */

  return null;
}

const TweakpaneContext = createContext(null);

export const useTweakpane = () => {
  const context = useContext(TweakpaneContext);
  if (!context) {
    throw new Error('useTweakpane must be used within a TweakpaneProvider');
  }
  return context;
};

export const TweakpaneProvider: React.FC<{
  children: ReactNode;
  hashparam?: string;
}> = ({ children, hashparam }) => {
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    // Only check the hash on the first load
    const hashParam = hashparam || 'dev'; // Default hash parameter name
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const falsyStrings = ['false', '0', '', 'null', 'undefined'];
    if (hashParams.has(hashParam)) {
      const value = hashParams.get(hashParam);
      setIsEnabled(value === null || !falsyStrings.includes(value));
      console.debug(`Tweakpane enabled`);
    }
  }, [hashparam]); // Empty dependency array to run only once on mount

  return (
    <TweakpaneContext.Provider value={null}>
      {children}
    </TweakpaneContext.Provider>
  );
};

export default TweakpaneProvider;
