# Setup

generated with:
`npx nx generate @nx/react:app geoportal --name geoportal --directory apps/geoportal --strict --minimal --e2eTestRunner "none" --verbose --unitTestRunner vitest --comp
iler swc`

vanilla options

```
  "compilerOptions": {
    "jsx": "react-jsx",
    "allowJs": false,
    "esModuleInterop": false,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "types": ["vite/client", "vitest"]
  }
```

cleaned:

```
{
  "extends": "../../tsconfig.strict.base.json",
  "references": [
    {
      "path": "./tsconfig.app.json"
    },
    {
      "path": "./tsconfig.spec.json"
    }
  ],
}

```
