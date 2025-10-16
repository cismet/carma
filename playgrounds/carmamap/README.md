# CarmaMap Playground

> **🚧 Under Construction** - This playground is currently being developed as a reference MVP/prototype for the new Redux-free library version of the Geoportal application.

## Overview

This playground serves as a **reference implementation** demonstrating how to build a Geoportal-like application using:

- **Library-based architecture** (no Redux dependencies)
- **Event bus pattern** for external API control
- **Clean separation** between UI components and API integration
- **Framework-agnostic** state management

## Current Status

### ✅ Completed
- **Redux-free architecture** - Removed all Redux store dependencies
- **Event bus integration** - MapStyleProvider pattern for external API control
- **Shared library hooks** - Using `@carma-mapping/engines/leaflet` and other libraries
- **Clean component structure** - Placeholder implementations for missing components

### 🚧 In Progress
- **State management** - Implementing library-based alternatives to Redux patterns
- **Component implementations** - Replacing placeholder components with real implementations
- **Cesium integration** - Proper Cesium context when available in libraries

### 📋 Architecture Goals

#### **Event Bus Pattern**
```typescript
// UI Components use React context for immediate feedback
const { currentStyle, setCurrentStyle } = useMapStyle();

// External APIs subscribe to events (no React rerenders)
const { subscribe } = useMapStyleBus();
useEffect(() => {
  const unsubscribe = subscribe((style) => {
    // Control Cesium without triggering React updates
    controlCesiumScene(style);
  });
  return unsubscribe;
}, []);
```

#### **Library-Based State Management**
- **No Redux store** dependencies
- **Framework-agnostic** state handling
- **Composable state** through library APIs

## Reference Implementation

This playground demonstrates how to build a Geoportal application using the **new library architecture**:

1. **UI Layer**: React components for user interactions
2. **Event Bus**: Framework-agnostic communication layer
3. **API Layer**: External system integration (Cesium, Leaflet, etc.)
4. **State Layer**: Library-based state management

## Future Development

### **Immediate Next Steps**
- [ ] Implement proper state management library
- [ ] Integrate with MapStyleProvider for event bus pattern
- [ ] Replace placeholder components with real implementations
- [ ] Add comprehensive testing

### **Long-term Vision**
- [ ] Serve as reference for other Geoportal implementations
- [ ] Demonstrate best practices for library-based applications
- [ ] Provide migration path from Redux-based applications

## Usage

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Architecture Documentation

For detailed architecture information, see:
- `libraries/appframeworks/portals/docs/map-style-architecture.md` - Event bus pattern details
- `apps/geoportal/src/app/components/GeoportalMap/` - Reference Redux-based implementation

---

**Note**: This playground is experimental and under active development. APIs and implementations may change as the library architecture evolves.
