# Redux Slice Guidelines

## Naming Conventions

### Selectors
- **Prefix:** `get[Slicename][KeyName]`
  - Example: `getFeaturesSelectedFeature`
- **Order:** Alphabetically

### Actions
- **Naming:** Use clear, verb-based names
  - Example: `addFeature`, `removeVectorInfo`
- **Order:** 
  - **Primary: Alphabetically grouped by related state properties**
  - **Secondary: alphabeticall within group**

## Ordering Principles

1. **State Properties**
   - Order alphabetically in `initialState`.

2. **Reducers and Selectors**
   - **Group** reducers and actions by related state properties.
   - **Within each group**, order by generic `set` first, then by life cycle (`add`, `remove`, `clear`).

## Best Practices

- **Encapsulation:**
  - **Export Only:** Actions, selectors, and reducer. Do not export the slice object.

- **Selectors Usage:**
  - Use `useSelector` hooks exclusively within React components.

- **Avoid Boilerplate:**
  - Keep slice files clean without inline comments. Refer to this README for guidelines.
