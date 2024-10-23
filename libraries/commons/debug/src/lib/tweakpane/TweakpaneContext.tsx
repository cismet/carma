import React, {
  createContext,
} from 'react';

import { type Pane } from 'tweakpane';

interface TweakpaneContextType {
  //isEnabled: boolean;
  paneRef: React.RefObject<Pane | null>;
}


export const TweakpaneContext = createContext<TweakpaneContextType | null>(null);

export default TweakpaneContext;
