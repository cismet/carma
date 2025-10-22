#!/usr/bin/env node

/**
 * Validates that all project.json outputPath values match their directory structure
 * 
 * Expected pattern: dist/{relative-path-from-root}
 * Example: libraries/mapping/engines/cesium/core → dist/libraries/mapping/engines/cesium/core
 * 
 * Usage: node scripts/validate-dist-paths.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function findProjectJsonFiles() {
  try {
    const output = execSync(
      'find . -name "project.json" -type f -not -path "*/node_modules/*" -not -path "*/.nx/*"',
      { cwd: ROOT_DIR, encoding: 'utf8' }
    );
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    log('Error finding project.json files', 'red');
    process.exit(1);
  }
}

function validateDistPath(projectJsonPath) {
  const fullPath = path.join(ROOT_DIR, projectJsonPath);
  const projectDir = path.dirname(projectJsonPath).replace(/^\.\//, '');
  
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const project = JSON.parse(content);
    
    // Extract outputPath from build target
    const buildTarget = project.targets?.build;
    if (!buildTarget || !buildTarget.options?.outputPath) {
      return null; // No build target or outputPath, skip
    }
    
    const outputPath = buildTarget.options.outputPath;
    const expectedPath = `dist/${projectDir}`;
    
    if (outputPath !== expectedPath) {
      return {
        file: projectJsonPath,
        expected: expectedPath,
        actual: outputPath,
        projectDir,
      };
    }
    
    return null;
  } catch (error) {
    log(`Error reading ${projectJsonPath}: ${error.message}`, 'red');
    return null;
  }
}

function main() {
  log('\n🔍 Validating dist paths in project.json files...\n', 'blue');
  
  const projectFiles = findProjectJsonFiles();
  log(`Found ${projectFiles.length} project.json files\n`, 'blue');
  
  const mismatches = [];
  
  for (const file of projectFiles) {
    const mismatch = validateDistPath(file);
    if (mismatch) {
      mismatches.push(mismatch);
    }
  }
  
  if (mismatches.length === 0) {
    log('✅ All dist paths are consistent!\n', 'green');
    process.exit(0);
  }
  
  log(`❌ Found ${mismatches.length} mismatch(es):\n`, 'red');
  
  for (const mismatch of mismatches) {
    log(`File: ${mismatch.file}`, 'yellow');
    log(`  Expected: ${mismatch.expected}`, 'green');
    log(`  Actual:   ${mismatch.actual}`, 'red');
    log('');
  }
  
  log('💡 Tip: outputPath should mirror the project directory structure', 'blue');
  log('   Pattern: dist/{relative-path-from-root}\n', 'blue');
  
  process.exit(1);
}

main();
