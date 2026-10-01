export type UpdateCheckFailureReason =
  | 'offline'
  | 'no_release'
  | 'invalid_manifest'
  | 'unknown';

function errorText(err: unknown): string {
  if (err instanceof Error) return `${err.message}\n${err.stack ?? ''}`;
  return String(err);
}

/** Classe l'échec de l'updater sans confondre un manifest invalide avec un 404. */
export function classifyUpdateCheckError(err: unknown): UpdateCheckFailureReason {
  const text = errorText(err).toLowerCase();

  const offlineHints = [
    'network',
    'connection',
    'connect',
    'timed out',
    'timeout',
    'dns',
    'offline',
    'unreachable',
    'failed to fetch',
    'error sending request',
    'could not resolve',
  ];
  if (offlineHints.some((hint) => text.includes(hint))) {
    return 'offline';
  }

  const noReleaseHints = [
    'status code 404',
    'http status 404',
    '404 not found',
    'no release',
    'release not found',
    'releasenotfound',
  ];
  if (noReleaseHints.some((hint) => text.includes(hint))) {
    return 'no_release';
  }

  const invalidManifestHints = [
    'error decoding response body',
    'could not fetch a valid release json',
    'failed to deserialize update response',
    'invalid release json',
    'invalid json',
  ];
  if (invalidManifestHints.some((hint) => text.includes(hint))) {
    return 'invalid_manifest';
  }

  return 'unknown';
}
