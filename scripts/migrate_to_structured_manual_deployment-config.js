const fs = require("fs");
const path = require("path");

// Define the path to the existing deployment-config.json file
const configPath = path.join(__dirname, "../deployment-config.json");

// Read the deployment-config.json file
fs.readFile(configPath, "utf8", (err, data) => {
  if (err) {
    console.error("Error reading the deployment config file:", err);
    return;
  }

  try {
    const oldConfig = JSON.parse(data); // Parse the old config file

    // Initialize new config structure
    const newConfig = {
      projects: {},
    };

    // Migrate each project
    for (const [projectName, projectData] of Object.entries(
      oldConfig.projects
    )) {
      const newProjectData = {
        deployment: {
          manual: {
            dev: {},
            live: {},
          },
          auto: {},
        },
        projectPath: projectData.projectPath,
      };

      // Migrate dev deployment from the old auto.dev to new manual.dev
      if (projectData.deployment.auto && projectData.deployment.auto.dev) {
        newProjectData.deployment.manual.dev.pages =
          projectData.deployment.auto.dev.pages;
        newProjectData.deployment.auto.dev = projectData.deployment.auto.dev; // Keep auto.dev as is
      }

      // Migrate live deployment from the old manual to new manual.live
      if (
        projectData.deployment.manual &&
        projectData.deployment.manual.pages
      ) {
        newProjectData.deployment.manual.live.pages =
          projectData.deployment.manual.pages;
      }

      // Assign the new project data to the new config structure
      newConfig.projects[projectName] = newProjectData;
    }

    // Write the new config back to the file
    const newConfigPath = path.join(__dirname, "../deployment-config.json");
    fs.writeFile(
      newConfigPath,
      JSON.stringify(newConfig, null, 2),
      (writeErr) => {
        if (writeErr) {
          console.error(
            "Error writing the new deployment config file:",
            writeErr
          );
          return;
        }
        console.log(
          "Migration completed successfully. New config saved to new deployment-config.json (use git to check the diffs)"
        );
      }
    );
  } catch (parseErr) {
    console.error("Error parsing the deployment config file:", parseErr);
  }
});
