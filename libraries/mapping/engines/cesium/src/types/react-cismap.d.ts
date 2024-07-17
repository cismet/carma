/* eslint-disable @typescript-eslint/no-explicit-any */

declare module 'react-cismap/contexts/TopicMapContextProvider' {
  import { Context } from 'react';
  export const TopicMapContext: Context<unknown>;
  export default TopicMapContext;
}

declare module 'react-cismap/topicmaps/TopicMapComponent' {
  const TopicMapComponent: any;
  export default TopicMapComponent;
}

declare module 'react-cismap/StyledWMSTileLayer' {
  const StyledWMSTileLayer: any;
  export default StyledWMSTileLayer;
}

declare module 'react-cismap/*' {
  const content: any;
  export default content;
}
