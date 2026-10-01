import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

export class ManifestValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ManifestValidationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ManifestValidationError(code, message);
}

function decodeUtf8(bytes, { allowBom = false } = {}) {
  const hasBom = bytes.subarray(0, UTF8_BOM.length).equals(UTF8_BOM);
  if (hasBom && !allowBom) {
    fail('UTF8_BOM', 'Le manifest contient un BOM UTF-8 (EF BB BF).');
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      hasBom ? bytes.subarray(UTF8_BOM.length) : bytes
    );
  } catch (error) {
    fail('INVALID_UTF8', `Le manifest n'est pas encodé en UTF-8 valide: ${error.message}`);
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail('INVALID_JSON', `Le manifest n'est pas un JSON valide: ${error.message}`);
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateManifestObject(manifest, { requiredPlatforms = [] } = {}) {
  if (!isObject(manifest)) {
    fail('INVALID_SHAPE', 'Le manifest doit être un objet JSON.');
  }
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
    fail('INVALID_VERSION', 'Le champ "version" doit être une chaîne non vide.');
  }
  if (
    manifest.pub_date !== undefined &&
    (typeof manifest.pub_date !== 'string' || Number.isNaN(Date.parse(manifest.pub_date)))
  ) {
    fail('INVALID_PUB_DATE', 'Le champ "pub_date" doit être une date ISO valide.');
  }
  if (!isObject(manifest.platforms) || Object.keys(manifest.platforms).length === 0) {
    fail('INVALID_PLATFORMS', 'Le champ "platforms" doit contenir au moins une plateforme.');
  }

  for (const [platform, release] of Object.entries(manifest.platforms)) {
    if (!platform.trim() || !isObject(release)) {
      fail('INVALID_PLATFORM', `Entrée de plateforme invalide: "${platform}".`);
    }
    if (typeof release.signature !== 'string' || !release.signature.trim()) {
      fail('INVALID_SIGNATURE', `Signature absente pour la plateforme "${platform}".`);
    }
    if (typeof release.url !== 'string') {
      fail('INVALID_URL', `URL absente pour la plateforme "${platform}".`);
    }
    try {
      const url = new URL(release.url);
      if (url.protocol !== 'https:') {
        fail('INVALID_URL', `L'URL de "${platform}" doit utiliser HTTPS.`);
      }
    } catch (error) {
      if (error instanceof ManifestValidationError) throw error;
      fail('INVALID_URL', `URL invalide pour la plateforme "${platform}".`);
    }
  }

  for (const platform of requiredPlatforms) {
    if (!Object.hasOwn(manifest.platforms, platform)) {
      fail('MISSING_PLATFORM', `Plateforme requise absente: "${platform}".`);
    }
  }

  return manifest;
}

export function validateManifestBytes(bytes, options) {
  return validateManifestObject(parseJson(decodeUtf8(bytes)), options);
}

export function validateManifestFile(filePath, options) {
  return validateManifestBytes(fs.readFileSync(filePath), options);
}

export function generateManifest(sourcePath, outputPath, options) {
  const source = fs.readFileSync(sourcePath);
  const manifest = validateManifestObject(parseJson(decodeUtf8(source, { allowBom: true })), options);
  const encoded = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, encoded);
  validateManifestBytes(fs.readFileSync(outputPath), options);
  return manifest;
}

function parseRequiredPlatforms(args) {
  const requiredPlatforms = [];
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--require-platform') {
      const platform = args[index + 1];
      if (!platform) fail('USAGE', 'Valeur manquante après --require-platform.');
      requiredPlatforms.push(platform);
      index += 1;
    } else {
      positional.push(args[index]);
    }
  }
  return { positional, requiredPlatforms };
}

function usage() {
  return [
    'Usage:',
    '  node scripts/updater-manifest.mjs generate <source.json> <latest.json> [--require-platform <cible>]',
    '  node scripts/updater-manifest.mjs validate <latest.json> [--require-platform <cible>]',
  ].join('\n');
}

function main(argv) {
  const [command, ...rest] = argv;
  const { positional, requiredPlatforms } = parseRequiredPlatforms(rest);
  const options = { requiredPlatforms };

  if (command === 'generate' && positional.length === 2) {
    generateManifest(positional[0], positional[1], options);
    console.log(`Manifest généré sans BOM: ${positional[1]}`);
    return;
  }
  if (command === 'validate' && positional.length === 1) {
    const manifest = validateManifestFile(positional[0], options);
    console.log(
      `Manifest valide: v${manifest.version} (${Object.keys(manifest.platforms).join(', ')})`
    );
    return;
  }

  throw new ManifestValidationError('USAGE', usage());
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof ManifestValidationError) {
      console.error(`[${error.code}] ${error.message}`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
