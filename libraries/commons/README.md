# @carma-commons

Common utilities and core functionality for CARMA applications.

## 📦 Package Structure

This workspace has been refactored into focused, single-purpose packages with clear boundaries:

### ✅ **Strict TypeScript Packages** (Modern, Type-Safe)

#### `@carma-commons/constants`
Shared constants and configuration values.
- EPSG coordinate system definitions
- Geographic constants
- Resolution fractions for rendering
- **No runtime logic** - pure constants

#### `@carma-commons/math`
Mathematical utilities and calculations.
- Math constants (PI, TWO_PI, PI_OVER_TWO, etc.)
- Angle normalization (negativePiToPi, zeroToTwoPi)
- Conversion factors (DEG_TO_RAD_FACTOR, RAD_TO_DEG_FACTOR)
- Number utilities (clamp, isClose, compoundScale)
- Easing functions
- Zoom calculations

#### `@carma-commons/units`
Type-safe unit conversions with branded types.
- Degree ↔ Radian conversions
- Branded arithmetic operations (brandedAdd, brandedMul, etc.)
- **Depends on:** `@carma-commons/math`

#### `@carma-commons/geo`
Geographic and coordinate system utilities.
- Coordinate transformations
- Mercator projection utilities
- Proj4 helpers
- Geographic calculations
- **Depends on:** `@carma-commons/constants`

#### `@carma-commons/dom-window`
Browser window and DOM utilities.
- Window dimension helpers
- Global shims for CJS environments
- Location utilities
- Delayed render handling
- Animation frame utilities
- WebGL context detection

#### `@carma-commons/dom-canvas`
Canvas-specific utilities.
- Canvas dimension calculations
- Canvas context helpers

#### `@carma-commons/formatters`
Formatting utilities (placeholder for future formatters).
- Number formatting
- Date/time formatting
- Coordinate formatting
- Unit formatting

#### `@carma-commons/react`
React-specific utilities and hooks.
- React error handlers
- Custom hooks
- Component utilities

---

### ⚠️ **Legacy Packages** (Working, Do Not Modify)

#### `@carma-commons/fetching`
**LEGACY** - HTTP fetching with caching.
- MD5-based cache management
- LocalForage integration
- **Do not modify unless critical bugfix**
- For new code, use modern fetch/axios

#### `@carma-commons/gazetteer`
**LEGACY** - Gazetteer data utilities.
- Gazetteer search data structures
- Search helpers
- **Consider modernizing** for new features

#### `@carma-commons/utils`
**LEGACY** - Remaining miscellaneous utilities.
- Array utilities
- String utilities
- Routing helpers
- Layer parsing
- Config utilities
- **New code should go into specific packages above**

---

## 🎯 Design Principles

### 1. **Single Responsibility**
Each package has one clear purpose. No mixing of concerns.

### 2. **Strict TypeScript by Default**
All new packages use `tsconfig.strict.base.json` for maximum type safety.

### 3. **No Circular Dependencies**
Packages have clear dependency hierarchies:

```
Layer 0 (foundational - no imports):
  - constants (only @carma/types)
  - math (only @carma/types)

Layer 1 (depends on Layer 0):
  - units (depends on: math)
  
Layer 2 (depends on Layers 0-1):
  - geo (depends on: constants, units, math)

Layer 3 (isolated - only types):
  - dom-window (only @carma/types)
  - dom-canvas (only @carma/types)  
  - formatters (only @carma/types)

Layer 4 (can depend on utils):
  - react (depends on: utils)

Legacy (isolated):
  - utils (can import: constants, @carma/types - NO circular deps allowed)
  - fetching (isolated legacy - no imports from other commons packages)
  - gazetteer (isolated legacy - no imports from other commons packages)
```

**Dependency Rules:**
- ✅ Lower layers can NEVER import from higher layers
- ✅ `constants` and `math` have ZERO imports (pure foundational packages)
- ✅ `utils` can ONLY import from: `@carma/types`, `constants`
- ✅ `react` can import from `utils` (but utils cannot import from react)
- ✅ No package can import from `fetching` or `gazetteer` (legacy isolation)
- ✅ Strict packages should prefer importing from other strict packages

### 4. **Legacy Isolation**
Old, working code is isolated in legacy packages with `tsconfig.legacy.base.json`.
- Prevents breakage of working code
- Clear separation from modern codebase
- Easy to identify for future refactoring

### 5. **Minimal Dependencies**
Each package depends only on what it needs:
- `constants` - zero dependencies (only `@carma/types`)
- `math` - zero dependencies (only `@carma/types`)
- `units` - depends only on `math`, `@carma/types`
- `geo` - depends on `constants`, `units`, `math`, `@carma/types`

---

## 📝 Migration Guide

### Moving Code from `utils`
When refactoring code from the legacy `utils` package:

1. **Identify the category:**
   - Math/calculations → `@carma-commons/math`
   - Geographic/coordinates → `@carma-commons/geo`
   - Units/conversions → `@carma-commons/units`
   - Browser/DOM → `@carma-commons/dom-window` or `@carma-commons/dom-canvas`
   - React-specific → `@carma-commons/react`
   - Constants → `@carma-commons/constants`
   - Fetching/caching → `@carma-commons/fetching` (legacy)


3. **Use strict TypeScript:**
   All new code should be type-safe with proper typing.

### Adding New Utilities
1. Choose the appropriate package based on functionality
2. Ensure it follows the package's single responsibility
3. Use strict TypeScript configuration
4. Add proper JSDoc documentation
5. Include unit tests

---

## 🧪 Testing Strategy

Each package should have its own test suite:
- Unit tests for pure functions
- Integration tests for complex utilities
- Type tests for branded types and type utilities

---

## 📊 Package Status

### ✅ Strict TypeScript (Recommended)
| Package | Size | Dependencies |
|---------|------|--------------|
| constants | Small | @carma/types, units |
| formatters | Small | @carma/types |
| geo | Medium | constants, units, math, proj4 |
| math | Small | @carma/types |
| react | Small | @carma-commons/utils |
| units | Small | math, @carma/types |

### 📦 Base TypeScript (Stable)
| Package | Size | Dependencies |
|---------|------|--------------|
| dom-canvas | Small | None |
| dom-window | Small | None |
| e2e | Small | None |
| resources | Medium | constants |
| utils | Medium | @carma/types |
| document-viewer | Medium | react-pdf |

### 🔧 Legacy TypeScript (Needs Migration)
| Package | Size | Dependencies | Notes |
|---------|------|--------------|-------|
| cismap | Large | react-cismap, leaflet | Wrapper around react-cismap |
| debug | Medium | antd, react, tweakpane | Uses `import.meta.env` |
| fetching | Small | localforage, md5 | Has unused promise parameters |
| gazetteer | Small | fetching, resources | Depends on legacy packages |
| measurements | Medium | antd, react | Complex UI components |

---

## 🔄 Future Improvements

1. **Deprecate `utils` package entirely**
   - Move all remaining code to appropriate packages
   - Remove legacy package

2. **Implement formatters**
   - Number formatters
   - Date/time formatters
   - Coordinate formatters

3. **Modernize legacy packages**
   - Refactor `fetching` to use modern fetch API
   - Update `gazetteer` to use modern search patterns

4. **Add more React utilities**
   - Common hooks
   - HOCs
   - Context utilities

---

## 📚 Related Documentation

- [TypeScript Configuration Guide](../../tsconfig.base.json)
- [Package Architecture](../../docs/architecture.md)
- [Contribution Guidelines](../../CONTRIBUTING.md)

---

## 🤝 Contributing

When adding new utilities:
1. Choose or create the appropriate package
2. Follow strict TypeScript patterns
3. Add comprehensive tests
4. Document public APIs
5. Update this README

For questions about package organization, consult the team lead.
