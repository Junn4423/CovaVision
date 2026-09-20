const path = require('node:path');

const DEFAULT_COVAVISION_API_BASE = 'http://127.0.0.1:8000';

function normalizeApiBase(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function resolveBackendRuntimeTarget(options = {}) {
  const isPackaged = options.isPackaged ?? false;
  const platform = options.platform || process.platform;
  const resourcesPath = options.resourcesPath || process.resourcesPath || process.cwd();
  const cliApiBase = process.argv.find(arg => arg.startsWith('--api-base='));
  const configuredApiBase = normalizeApiBase(
    cliApiBase?.slice('--api-base='.length) || process.env.COVAVISION_API_URL,
  );
  const apiBaseUrl = configuredApiBase || DEFAULT_COVAVISION_API_BASE;
  if (!isPackaged || configuredApiBase) {
    return {
      apiBaseUrl,
      usesLocalBackend: false,
      backendExecutable: null,
      insightfaceHome: null,
      prismaSchema: null,
    };
  }

  const platformPath = platform === 'win32' ? path.win32 : path.posix;
  const executableName = platform === 'win32' ? 'covavision-backend.exe' : 'covavision-backend';
  return {
    apiBaseUrl,
    usesLocalBackend: true,
    backendExecutable: platformPath.join(resourcesPath, 'backend-runtime', executableName),
    insightfaceHome: platformPath.join(resourcesPath, 'insightface_models'),
    prismaSchema: platformPath.join(resourcesPath, 'prisma', 'schema.prisma'),
  };
}

module.exports = {
  DEFAULT_COVAVISION_API_BASE,
  resolveBackendRuntimeTarget,
};
