const DEFAULT_COVAVISION_API_BASE = 'http://127.0.0.1:8000';

function normalizeApiBase(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function resolveBackendRuntimeTarget() {
  const cliApiBase = process.argv.find(arg => arg.startsWith('--api-base='));
  return {
    apiBaseUrl: normalizeApiBase(
      cliApiBase?.slice('--api-base='.length)
        || process.env.COVAVISION_API_URL
        || DEFAULT_COVAVISION_API_BASE,
    ),
    usesLocalBackend: false,
  };
}

module.exports = {
  DEFAULT_COVAVISION_API_BASE,
  resolveBackendRuntimeTarget,
};
