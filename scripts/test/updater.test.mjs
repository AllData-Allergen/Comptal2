import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  generateManifest,
  ManifestValidationError,
  validateManifestBytes,
  validateManifestFile,
} from '../updater-manifest.mjs';
import { classifyUpdateCheckError } from '../../src/services/UpdateErrors.ts';

const validManifest = {
  version: '2.1.3',
  notes: 'Test updater',
  pub_date: '2026-09-26T11:19:25.568Z',
  platforms: {
    'windows-x86_64': {
      signature: 'signature-test',
      url: 'https://example.invalid/Comptal2.1_2.1.3_x64-setup.exe',
    },
  },
};

function expectCode(expectedCode) {
  return (error) =>
    error instanceof ManifestValidationError &&
    error.code === expectedCode;
}

test('le générateur retire le BOM et écrit un UTF-8 strict', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comptal-updater-'));
  const source = path.join(tempDir, 'source.json');
  const output = path.join(tempDir, 'latest.json');

  try {
    fs.writeFileSync(
      source,
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from(JSON.stringify(validManifest), 'utf8'),
      ])
    );

    generateManifest(source, output, { requiredPlatforms: ['windows-x86_64'] });

    const generated = fs.readFileSync(output);
    assert.notDeepEqual([...generated.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(validateManifestFile(output).version, '2.1.3');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('la validation stricte rejette un BOM UTF-8', () => {
  const bytes = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(JSON.stringify(validManifest), 'utf8'),
  ]);

  assert.throws(() => validateManifestBytes(bytes), expectCode('UTF8_BOM'));
});

test('la validation stricte rejette un JSON invalide', () => {
  assert.throws(
    () => validateManifestBytes(Buffer.from('{"version":', 'utf8')),
    expectCode('INVALID_JSON')
  );
});

test('la validation stricte contrôle les plateformes requises', () => {
  const bytes = Buffer.from(JSON.stringify(validManifest), 'utf8');

  assert.throws(
    () => validateManifestBytes(bytes, { requiredPlatforms: ['linux-x86_64'] }),
    expectCode('MISSING_PLATFORM')
  );
});

test('une erreur de décodage du manifest est distincte d’une release absente', () => {
  const error = new Error(
    'error decoding response body for url ' +
      '(https://github.com/AllData-Allergen/Comptal2/releases/latest/download/latest.json)'
  );

  assert.equal(classifyUpdateCheckError(error), 'invalid_manifest');
});

test('seul un signal explicite de release absente produit no_release', () => {
  assert.equal(classifyUpdateCheckError(new Error('HTTP status code 404')), 'no_release');
  assert.equal(
    classifyUpdateCheckError(
      new Error('https://github.com/AllData-Allergen/Comptal2/releases/latest/download/latest.json')
    ),
    'unknown'
  );
});

test('les erreurs réseau restent classées offline', () => {
  assert.equal(classifyUpdateCheckError(new Error('error sending request')), 'offline');
});
