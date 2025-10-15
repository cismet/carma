# event-bus

Generic typed event bus utility for scoped provider communication.

## Usage Pattern

**Do not use global EventBusProvider.** Instead, each context provider creates its own scoped bus.

### 1. Define Event Map

```typescript
// MyProviderEvents.ts
export type MyProviderEventMap = {
  'data-loaded': { items: Item[] };
  'selection-changed': { id: string };
  'error': { message: string };
};
```

### 2. Create Scoped Bus in Provider

```typescript
// MyProvider.tsx
import { createEventBus, type EventBus } from '@carma/providers/event-bus';
import type { MyProviderEventMap } from './MyProviderEvents';

interface MyContextType {
  subscribe: EventBus<MyProviderEventMap>['subscribe'];
  emit: EventBus<MyProviderEventMap>['emit'];
  // ... other context values
}

export const MyProvider = ({ children }: { children: ReactNode }) => {
  const { subscribe, emit } = useMemo(
    () => createEventBus<MyProviderEventMap>(),
    []
  );

  return (
    <MyContext.Provider value={{ subscribe, emit }}>
      {children}
    </MyContext.Provider>
  );
};
```

### 3. Emit Events

```typescript
// Inside MyProvider or child components
const { emit } = useMyContext();

const loadData = async () => {
  try {
    const items = await fetchItems();
    emit('data-loaded', { items });
  } catch (error) {
    emit('error', { message: error.message });
  }
};
```

### 4. Subscribe to Events

```typescript
// Consumer component
const { subscribe } = useMyContext();

useEffect(() => {
  const unsubscribe = subscribe('data-loaded', ({ items }) => {
    console.log('Loaded items:', items);
  });
  
  return unsubscribe;
}, [subscribe]);

// Multiple subscriptions from same bus
useEffect(() => {
  const unsubData = subscribe('data-loaded', handleDataLoaded);
  const unsubError = subscribe('error', handleError);
  
  return () => {
    unsubData();
    unsubError();
  };
}, [subscribe]);
```

### 5. Subscribe to Multiple Buses

```typescript
// Component using multiple providers
const { subscribe: subscribeCesium } = useCesiumContext();
const { subscribe: subscribeTransition } = useTransitionContext();
const { subscribe: subscribeStyle } = useMapStyleProvider();

useEffect(() => {
  const unsubScene = subscribeCesium('scene-ready', () => {
    console.log('3D scene ready');
  });
  
  const unsubMode = subscribeTransition('mode-changed', ({ mode }) => {
    console.log('Mode changed to:', mode);
  });
  
  const unsubStyle = subscribeStyle('style-changed', ({ styleId }) => {
    console.log('Style changed to:', styleId);
  });
  
  return () => {
    unsubScene();
    unsubMode();
    unsubStyle();
  };
}, [subscribeCesium, subscribeTransition, subscribeStyle]);
```

## Benefits

- **Type-safe**: Event names and payloads are strictly typed
- **Scoped**: Each provider has isolated event namespace
- **No conflicts**: Different providers can use same event names
- **Debuggable**: Know which provider emitted which event
- **Testable**: Mock specific provider's bus, not global system

## Examples in Codebase

- `CesiumContextProvider` - 3D scene events
- `CarmaTopicMapContextProvider` - 2D map events
- `TransitionContextProvider` - Mode change events
- `MapStyleProvider` - Style change events
- `SelectionProvider` - Feature selection events
