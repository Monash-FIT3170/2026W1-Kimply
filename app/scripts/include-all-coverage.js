const fs = require('fs');
const path = require('path');
const { createInstrumenter } = require('istanbul-lib-instrument');

const appDir = process.cwd();
const coveragePath = path.join(appDir, '.nyc_output', 'coverage.json');
const importsDir = path.join(appDir, 'imports');
const includedExtensions = new Set(['.js', '.jsx']);

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath);
    if (!entry.isFile()) return [];
    return includedExtensions.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

function createEmptyCoverage(filePath) {
  const instrumenter = createInstrumenter({
    coverageVariable: '__coverage__',
    esModules: true,
    produceSourceMap: false,
    parserPlugins: ['jsx'],
  });

  instrumenter.instrumentSync(fs.readFileSync(filePath, 'utf8'), filePath);
  return instrumenter.fileCoverage;
}

if (!fs.existsSync(coveragePath)) {
  throw new Error(`Coverage file not found: ${coveragePath}`);
}

const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));

for (const filePath of walkFiles(importsDir)) {
  if (!coverage[filePath]) {
    coverage[filePath] = createEmptyCoverage(filePath);
  }
}

fs.writeFileSync(coveragePath, `${JSON.stringify(coverage)}\n`);
