import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const GEOPORTAL_DIR = path.join(process.cwd(), "apps", "geoportal");
const OUTPUT_FILE = path.join(GEOPORTAL_DIR, "geoportal-overview.md");

async function runReduxAnalysis(): Promise<string> {
  try {
    const output = execSync(
      `node --experimental-strip-types scripts/analyze_geoportal_redux.ts`,
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );
    return output;
  } catch (error) {
    console.error("Error running Redux analysis:", error);
    throw error;
  }
}

async function runComponentAnalysis(): Promise<string> {
  try {
    const output = execSync(
      `node --experimental-strip-types scripts/analyze_geoportal_components.ts`,
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );
    return output;
  } catch (error) {
    console.error("Error running component analysis:", error);
    throw error;
  }
}

function generateMarkdownHeader(): string {
  const timestamp = new Date().toISOString();
  return `# Geoportal Application Overview

_Last updated: ${timestamp}_

## Workspace Information

This overview provides a snapshot of the Geoportal application and its Redux state management flow.

`;
}

async function main() {
  try {
    console.log("Starting Geoportal documentation generation...");

    let markdownContent = generateMarkdownHeader();

    // Add component analysis
    console.log("Running component analysis...");
    const componentOutput = await runComponentAnalysis();
    
    // Extract the diagram from component output - look for the Component Structure Diagram section
    const diagramStart = componentOutput.indexOf("//////////////////// Component Structure Diagram ////////////////////");
    const mermaidStart = componentOutput.indexOf("```mermaid", diagramStart);
    const mermaidEnd = componentOutput.indexOf("```", mermaidStart + 1);
    const descStart = componentOutput.indexOf("**Application Structure Overview:**");
    const descEnd = componentOutput.indexOf("////////////////////////////////////////////////////////////////////", descStart);
    
    if (mermaidStart !== -1 && mermaidEnd !== -1) {
      const diagramSection = componentOutput.substring(mermaidStart, mermaidEnd + 3);
      markdownContent += "## Application Structure\n\n";
      markdownContent += diagramSection + "\n\n";
      
      // Add description after the diagram
      if (descStart !== -1 && descEnd !== -1) {
        const descSection = componentOutput.substring(descStart, descEnd);
        markdownContent += descSection.trim() + "\n\n";
      }
    }

    // Add Redux analysis
    console.log("Running Redux analysis...");
    const reduxOutput = await runReduxAnalysis();
    
    // Extract the Redux section - look for the markdown section specifically
    const reduxMarkdownStart = reduxOutput.indexOf("//////////////////// Redux Store Structure (Markdown) ////////////////////");
    const reduxContentStart = reduxOutput.indexOf("### 📦", reduxMarkdownStart);
    const reduxEnd = reduxOutput.lastIndexOf("////////////////////////////////////////////////////////////////////");
    
    if (reduxContentStart !== -1 && reduxEnd !== -1) {
      // Add the Redux header
      markdownContent += "## Redux Store Structure\n\n";
      // Extract the content between the start and end markers
      const reduxContent = reduxOutput.substring(reduxContentStart, reduxEnd);
      markdownContent += reduxContent.trim() + "\n";
    } else if (reduxMarkdownStart !== -1) {
      // Fallback: try to extract everything after the markdown header
      const reduxSection = reduxOutput.substring(reduxMarkdownStart);
      markdownContent += "## Redux Store Structure\n\n";
      markdownContent += reduxSection.replace(/\/+/g, '').trim() + "\n";
    }

    // Write the output file
    await fs.promises.writeFile(OUTPUT_FILE, markdownContent, "utf8");
    console.log(`Documentation generated: ${OUTPUT_FILE}`);
  } catch (error) {
    console.error("Error generating documentation:", error);
    process.exit(1);
  }
}

main();