const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DESKTOP_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(DESKTOP_ROOT, '..', '..');
const OUTPUT_DIR = path.join(DESKTOP_ROOT, 'backend-runtime');
const ASSET_DIR = path.join(DESKTOP_ROOT, 'runtime-assets');

function findPython() {
  const candidates = [
    process.env.COVAVISION_PYTHON,
    path.join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe'),
    path.join(PROJECT_ROOT, '.venv', 'bin', 'python'),
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) || (process.platform === 'win32' ? 'python' : 'python3');
}

function findModelRoot() {
  const candidates = [
    process.env.COVAVISION_MODEL_DIR,
    path.join(PROJECT_ROOT, 'data', 'insightface_models'),
    path.join(PROJECT_ROOT, 'insightface_models'),
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(path.join(candidate, 'models'))) || null;
}

function buildPlan() {
  return {
    python: findPython(),
    schema: path.join(PROJECT_ROOT, 'prisma', 'schema.prisma'),
    modelRoot: findModelRoot(),
    outputDir: OUTPUT_DIR,
    assetDir: ASSET_DIR,
  };
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {cwd, stdio: 'inherit', shell: false});
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${result.status}`);
  }
}

function prepare() {
  const plan = buildPlan();
  if (!plan.modelRoot) {
    throw new Error(
      'Không tìm thấy model InsightFace. Đặt COVAVISION_MODEL_DIR tới thư mục có models/buffalo_s trước khi build release.',
    );
  }

  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  const stagingDir = path.join(DESKTOP_ROOT, '.pyinstaller-dist');
  const workDir = path.join(DESKTOP_ROOT, '.pyinstaller-build');
  fs.rmSync(OUTPUT_DIR, {recursive: true, force: true});
  fs.rmSync(ASSET_DIR, {recursive: true, force: true});
  fs.rmSync(stagingDir, {recursive: true, force: true});
  fs.rmSync(workDir, {recursive: true, force: true});
  fs.mkdirSync(path.join(ASSET_DIR, 'prisma'), {recursive: true});
  fs.copyFileSync(plan.schema, path.join(ASSET_DIR, 'prisma', 'schema.prisma'));
  fs.cpSync(plan.modelRoot, path.join(ASSET_DIR, 'insightface_models'), {recursive: true});

  run(plan.python, ['-m', 'prisma', 'generate', '--schema', plan.schema], PROJECT_ROOT);
  run(plan.python, [
    '-m', 'PyInstaller',
    '--noconfirm', '--clean', '--onedir',
    '--name', 'covavision-backend',
    '--distpath', stagingDir,
    '--workpath', workDir,
    '--specpath', workDir,
    '--paths', path.join(PROJECT_ROOT, 'backend'),
    '--add-data', `${plan.schema}${pathSeparator}prisma`,
    '--collect-all', 'prisma',
    '--collect-all', 'insightface',
    '--collect-all', 'onnxruntime',
    path.join(PROJECT_ROOT, 'backend', 'scripts', 'runtime_server.py'),
  ], PROJECT_ROOT);

  fs.renameSync(path.join(stagingDir, 'covavision-backend'), OUTPUT_DIR);
  fs.rmSync(stagingDir, {recursive: true, force: true});
  fs.rmSync(workDir, {recursive: true, force: true});
  console.log(`Backend runtime prepared at ${OUTPUT_DIR}`);
}

if (require.main === module) prepare();

module.exports = {buildPlan, findModelRoot};
