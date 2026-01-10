#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function fixImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Fix import statements with double quotes: from "./module" -> from "./module.js"
  content = content.replace(
    /from\s+["'](\.[^"']+)["']/g,
    (match, importPath) => {
      // Skip if already has .js extension or is a directory import
      if (importPath.endsWith('.js') || importPath.endsWith('.json')) {
        return match;
      }
      // Check if it's a file that exists (might need .js extension)
      const dir = path.dirname(filePath);
      const fullPath = path.resolve(dir, importPath);
      if (fs.existsSync(fullPath + '.js') || fs.existsSync(fullPath + '/index.js')) {
        modified = true;
        return match.replace(importPath, importPath + '.js');
      }
      // For directory imports, add /index.js
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        modified = true;
        return match.replace(importPath, importPath + '/index.js');
      }
      // Default: add .js extension
      modified = true;
      return match.replace(importPath, importPath + '.js');
    }
  );

  // Also fix require-style dynamic imports and export from
  content = content.replace(
    /from\s+["'](\.[^"']+)["']/g,
    (match, importPath) => {
      if (importPath.endsWith('.js') || importPath.endsWith('.json')) {
        return match;
      }
      modified = true;
      return match.replace(importPath, importPath + '.js');
    }
  );

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}

function fixImportsInDir(dir) {
  const files = fs.readdirSync(dir);
  let fixedCount = 0;

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      fixedCount += fixImportsInDir(filePath);
    } else if (file.endsWith('.js')) {
      if (fixImportsInFile(filePath)) {
        fixedCount++;
      }
    }
  }

  return fixedCount;
}

const distDir = path.join(__dirname, '..', 'dist');
console.log('Fixing imports in', distDir);
const count = fixImportsInDir(distDir);
console.log(`Fixed imports in ${count} files`);

