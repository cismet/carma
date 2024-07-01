import React, {
  createContext,
  useContext,
  useRef,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { useTweakpane } from './react-tweakpane-patched';
import { PaneConfig } from 'tweakpane/dist/types/pane/pane-config';
import {
  useSliderBlade,
  useListBlade,
  usePaneFolder,
  usePaneInput,
  useTextBlade,
} from './react-tweakpane-patched';

interface TweakpaneContextType {
  isEnabled: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
}

const eventKey = 'F8';

const TweakpaneContext = createContext<TweakpaneContextType | null>(null);

const useTweakpaneCtx = (params, config: PaneConfig) => {
  const context = useContext(TweakpaneContext);

  if (!context) {
    throw new Error('useTweakpane must be used within a TweakpaneProvider');
  }

  console.log('PROVIDER: TweakpaneProvider', context.containerRef.current);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useTweakpane(params, {
    ...config,
    container: context.containerRef.current!,
  });
};

const TweakpaneProvider: React.FC<{
  children: ReactNode;
  hashparam?: string;
}> = ({ children, hashparam = 'dev' }) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const falsyStrings = ['false', '0', 'null', 'undefined'];
    const value = hashParams.get(hashparam);
    const isEnabledCheck = value !== null && !falsyStrings.includes(value);
    console.log('HOOK: TweakpaneProvider', isEnabledCheck);
    setIsEnabled(isEnabledCheck);
    // Function to toggle isEnabled state

    const toggleTweakpane = (event: KeyboardEvent) => {
      if (event.key === eventKey || event.key === 'b') {
        setIsEnabled((prevState) => !prevState);
        console.log('HOOK: TweakpaneProvider', isEnabled, event.key);
      }
    };

    // Add event listener for keydown
    window.addEventListener('keydown', toggleTweakpane);

    // Cleanup function to remove the event listener
    return () => {
      window.removeEventListener('keydown', toggleTweakpane);
    };
  }, [hashparam]);

  return (
    <TweakpaneContext.Provider value={{ isEnabled, containerRef }}>
      <div
        ref={containerRef}
        id="tweakpane-container"
        style={{ display: isEnabled ? 'absolute' : 'none' }}
      ></div>
      {children}
    </TweakpaneContext.Provider>
  );
};

export {
  useSliderBlade,
  useListBlade,
  usePaneFolder,
  usePaneInput,
  useTextBlade,
  //useTweakpane,
  useTweakpaneCtx,
  TweakpaneProvider,
};

export default TweakpaneProvider;
