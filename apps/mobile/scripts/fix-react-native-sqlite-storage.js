const fs = require('fs');
const path = require('path');

const targetFile = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-sqlite-storage',
  'platforms',
  'android',
  'build.gradle',
);

function main() {
  if (!fs.existsSync(targetFile)) {
    return;
  }

  const source = fs.readFileSync(targetFile, 'utf8');
  if (!source.includes('jcenter()')) {
    return;
  }

  const patched = source.replace(/\bjcenter\(\)/g, 'mavenCentral()');
  if (patched !== source) {
    fs.writeFileSync(targetFile, patched, 'utf8');
  }
}

main();
