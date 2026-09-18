const fs = require('fs');
const path = require('path');

const targetFile = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-vlc-media-player',
  'android',
  'src',
  'main',
  'java',
  'com',
  'yuanzhou',
  'vlc',
  'vlcplayer',
  'ReactVlcPlayerView.java',
);

function main() {
  if (!fs.existsSync(targetFile)) {
    return;
  }

  let source = fs.readFileSync(targetFile, 'utf8');
  if (source.includes('for (int i = 0; i < options.size() - 1; i++)')) {
    source = source.replace(
      /for \(int i = 0; i < options\.size\(\) - 1; i\+\+\)/g,
      'for (int i = 0; i < options.size(); i++)',
    );
    fs.writeFileSync(targetFile, source, 'utf8');
    console.log('[fix-react-native-vlc] Patched options loop in ReactVlcPlayerView.java');
  }
}

main();
