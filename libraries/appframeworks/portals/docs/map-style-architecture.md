# TODO update to current state 

# Map Style Synchronization Architecture

This document explains the event-driven architecture for synchronizing map style changes across different systems in CARMA applications.

## Overview

The map style synchronization system uses an event bus approach to decouple React UI components from external API control, preventing unnecessary rerenders while maintaining clean separation of concerns.

## Architecture Diagram

```mermaid
graph TB
    subgraph "User Interface Layer"
        A[UI Components<br/>Layer Selection<br/>Navigation Controls]
        B[MapStyleProvider<br/>React Context]
    end

    subgraph "Event Bus Layer"
        C[MapStyleBus<br/>Event Bus]
    end

    subgraph "External API Layer"
        D[useSyncCesiumSceneStyle<br/>Cesium API Control]
        E[useMapStyleReduxSync<br/>Redux State Sync]
    end

    A -->|setCurrentStyle()| B
    B -->|emit()| C
    C -->|subscribe()| D
    C -->|subscribe()| E

    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style C fill:#fff3e0
    style D fill:#e8f5e8
    style E fill:#fce4ec
```

## Component Roles

### UI Components (`useMapStyle()` - React Context)
**Purpose**: Handle user interactions and UI state
- **Pattern**: Use React context for immediate UI feedback
- **Responsibilities**:
  - Display current map style state
  - Handle user interactions (clicks, selections)
  - Update React context state

### MapStyleProvider (React Context + Event Bus)
**Purpose**: Bridge between React and event-driven systems
- **Location**: `src/lib/contexts/MapStyleProvider.tsx`
- **Dual Role**:
  - Provides React context for UI components
  - Emits events to the bus for external API control
- **Hash Integration**: Syncs with URL hash parameters

### Event Bus (`useMapStyleBus()`)
**Purpose**: Framework-agnostic event broadcasting
- **Location**: `src/lib/hooks/useMapStyleBus.ts`
- **Features**:
  - Type-safe event system
  - No React dependencies
  - Automatic cleanup

### External API Controllers

#### useSyncCesiumSceneStyle (Event Bus Subscriber)
**Purpose**: Control Cesium 3D scene styles
- **Location**: `src/lib/hooks/useSyncCesiumSceneStyle.ts`
- **Responsibilities**:
  - Subscribe to map style changes via event bus
  - Map Portal styles to Cesium scene styles:
    - `AERIAL` → `MESH` (3D mesh buildings)
    - `TOPO` → `LOD2` (2D-like representation)
  - Emit Cesium context events
- **Benefits**:
  - No React rerenders for API control
  - Decoupled from React lifecycle

#### useMapStyleReduxSync (Event Bus Subscriber)
**Purpose**: Synchronize with Redux state management
- **Location**: `apps/geoportal/src/app/hooks/useMapStyleReduxSync.tsx`
- **Responsibilities**:
  - Subscribe to map style changes via event bus
  - Update Redux background layer state based on selected layers
  - No direct Cesium API calls (decoupled)

## Data Flow

### User Changes Map Style
1. **UI Component** calls `setCurrentStyle()` on React context
2. **MapStyleProvider** updates React state AND emits event to bus
3. **Event Bus** broadcasts change to all subscribers
4. **External Controllers** receive events and update their respective systems

### Example Implementation: Geoportal Integration
See `apps/geoportal/src/app/hooks/useMapStyleReduxSync.tsx` for a complete example of how this architecture is implemented in the Geoportal application.

## Benefits

### ✅ **No Unnecessary Rerenders**
- External API control doesn't trigger React component updates
- UI components only rerender when their specific state changes

### ✅ **Clean Separation of Concerns**
- UI components handle user interactions
- External controllers handle API integration
- Event bus decouples the layers

### ✅ **Framework Agnostic**
- Event bus works independently of React
- Can be used in any JavaScript environment

### ✅ **Type Safety**
- Full TypeScript support throughout the chain
- Compile-time guarantees for event payloads

### ✅ **Testable**
- Each layer can be tested independently
- Easy to mock event bus for unit tests

## Usage Patterns

### For UI Components
```typescript
// React context for UI interactions
const { currentStyle, setCurrentStyle } = useMapStyle();
```

### For External API Control
```typescript
// Event bus for API synchronization
const { subscribe } = useMapStyleBus();
useEffect(() => {
  const unsubscribe = subscribe((style) => {
    // Control external APIs without React rerenders
    controlCesiumScene(style);
  });
  return unsubscribe;
}, []);
```
