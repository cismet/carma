import { defineConfig } from "cypress";
import { nxE2EPreset } from "@nx/cypress/plugins/cypress-preset";

export default defineConfig({
  e2e: {
    ...nxE2EPreset(__dirname, {
      ciWebServerCommand: "npx nx run verkehrszeichenkataster:serve-static",
      webServerCommands: {
        default: "npx nx run verkehrszeichenkataster:serve:development",
        production: "npx nx run verkehrszeichenkataster:serve:production",
        ci: "npx nx run verkehrszeichenkataster:serve-static",
      },
    }),
    screenshotsFolder: "./report-cy/screenshots",
    // Please ensure you use `cy.origin()` when navigating between domains and remove this option.
    // See https://docs.cypress.io/app/references/migration-guide#Changes-to-cyorigin
    injectDocumentDomain: true,
  },
});
