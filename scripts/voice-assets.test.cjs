const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { verifyFiles, verifyVersions } = require('./voice-assets.cjs');

test('rejects runtime drift and nested runtime versions', () => {
  const pkg = { dependencies: { 'onnxruntime-web': '1.23.2' }, overrides: { 'onnxruntime-web': '1.23.2' } };
  const lock = { packages: { 'node_modules/onnxruntime-web': { version: '1.23.2' } } };
  assert.doesNotThrow(() => verifyVersions(pkg, lock, '1.23.2'));
  assert.throws(() => verifyVersions(pkg, lock, '1.27.0'), /pinned runtime/);
  lock.packages['node_modules/other/node_modules/onnxruntime-web'] = { version: '1.17.0' };
  assert.throws(() => verifyVersions(pkg, lock, '1.23.2'), /Duplicate ONNX/);
});

test('rejects missing and corrupted assets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aira-assets-'));
  const file = path.join(dir, 'test.wasm');
  const data = Buffer.from('test fixture');
  const hashes = { 'test.wasm': createHash('sha256').update(data).digest('hex') };
  try {
    assert.throws(() => verifyFiles(dir, hashes), /Missing/);
    fs.writeFileSync(file, data);
    assert.doesNotThrow(() => verifyFiles(dir, hashes));
    fs.writeFileSync(file, 'wrong version');
    assert.throws(() => verifyFiles(dir, hashes), /mismatched/);
  } finally {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
});
