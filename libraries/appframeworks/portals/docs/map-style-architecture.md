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

### PortalStateContext (Reactive State Management)
**Purpose**: URL + React state as single source of truth
- **Location**: [PortalStateContext.tsx](../src/lib/contexts/PortalContext/PortalStateContext.tsx)
- **Features**:
  - Reactive `useState` alongside refs for consumer re-renders
  - Automatic URL hash synchronization
  - No event bus needed - React's built-in reactivity

### PortalReduxSyncProvider (Bridge to Legacy Redux)
**Purpose**: Sync Portal state to Redux for backward compatibility
- **Location**: `apps/geoportal/src/app/components/PortalReduxSyncProvider.tsx`
- **Responsibilities**:
  - Listen to PortalContext state changes via `usePortalMapStyle()`
  - Forward changes to Redux for TopicMap compatibility
  - Must be child of PortalContextProvider
- **Benefits**:
  - Keeps Portal components Redux-free
  - Maintains backward compatibility with TopicMap

## Data Flow

### User Changes Map Style (e.g., TopNavbar)
1. **UI Component** calls `setCurrentStyle()` from `usePortalMapStyle()`
2. **PortalContext** updates both ref AND state (triggers re-renders)
3. **Hash** automatically updated via `updateHash()`
4. **PortalReduxSyncProvider** (via `useEffect`) syncs to Redux
5. **TopicMap** updates based on Redux state

### Example Implementation: Geoportal
```
TopNavbar → setCurrentStyle("aerial")
  ↓
PortalContext (reactive state + URL)
  ↓
PortalReduxSyncProvider (useEffect listener)
  ↓
Redux setBackgroundLayer()
  ↓
TopicMap updates ✅
```

## Benefits

### ✅ **Reactive & Simple**
- React's built-in reactivity (useState) - no custom event system
- Automatic re-renders when state changes

### ✅ **Clean Separation of Concerns**
- Portal components: Pure React (no Redux)
- PortalReduxSyncProvider: Bridge layer
- TopicMap: Legacy Redux

### ✅ **Single Source of Truth**
- URL hash + PortalContext state
- No sync issues between multiple state systems

### ✅ **Type Safety**
- Full TypeScript support throughout
- Compile-time guarantees

### ✅ **Testable**
- Each layer can be tested independently
- Standard React testing patterns

## Usage Patterns

### For Portal UI Components
```typescript
// Read/write Portal state (triggers re-renders)
const { current: currentStyle, set: setCurrentStyle } = usePortalMapStyle();

// Change style
setCurrentStyle(MapStyleKeys.AERIAL);
```

### For Redux Sync (App-Level)
```typescript
// In PortalReduxSyncProvider
const { current: currentMapStyle } = usePortalMapStyle();

useEffect(() => {
  // Sync to Redux when Portal state changes
  dispatch(setBackgroundLayer(...));
}, [currentMapStyle]);
```
