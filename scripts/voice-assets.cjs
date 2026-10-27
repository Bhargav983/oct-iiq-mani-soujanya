const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function collect() {
  const pkg = read(path.join(root, 'package.json'));
  const ortRoot = path.resolve(path.dirname(require.resolve('onnxruntime-web')), '..');
  const vadRoot = path.dirname(require.resolve('@ricky0123/vad-web/package.json'));
  const ort = read(path.join(ortRoot, 'package.json')).version;
  const vad = read(path.join(vadRoot, 'package.json')).version;
  const lock = read(path.join(root, 'package-lock.json'));
  verifyVersions(pkg, lock, ort);
  const files = {};
  const add = (name, file) => { files[name] = fs.readFileSync(file); };
  for (const name of fs.readdirSync(path.join(ortRoot, 'dist')).filter(name => /^ort-wasm.*\.(wasm|mjs)$/.test(name))) {
    add(`ort/${name}`, path.join(ortRoot, 'dist', name));
  }
  add('ort/ort.min.mjs', path.join(ortRoot, 'dist/ort.min.mjs'));
  add('engine/WakeWordEngine.js', path.join(path.dirname(require.resolve('openwakeword-wasm-browser')), 'WakeWordEngine.js'));
  for (const name of ['vad.worklet.bundle.min.js', 'silero_vad_v5.onnx']) add(`vad/${name}`, path.join(vadRoot, 'dist', name));
  for (const name of ['melspectrogram.onnx', 'embedding_model.onnx', 'silero_vad.onnx', 'hey_aira.onnx']) {
    add(`wake/${name}`, path.join(root, 'public/openwakeword/models', name));
  }
  const hashes = Object.fromEntries(Object.keys(files).sort().map(name => [name, sha(files[name])]));
  const revision = sha(JSON.stringify({ ort, vad, hashes })).slice(0, 16);
  const base = `/voice-assets/${revision}/`;
  const manifest = { ortVersion: ort, vadVersion: vad, revision, ortPath: `${base}ort/`, vadPath: `${base}vad/`, wakePath: `${base}wake/`, enginePath: `${base}engine/WakeWordEngine.js`, hashes };
  return { manifest, files };
}

function run(sync) {
  const { manifest, files } = collect();
  const manifestFile = path.join(root, 'src/AiraAssistant/voiceAssets.json');
  const target = path.join(root, 'public/voice-assets', manifest.revision);
  if (sync) {
    for (const [name, bytes] of Object.entries(files)) {
      const file = path.join(target, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes);
    }
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(root, 'public/voice-assets-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
  if (JSON.stringify(read(manifestFile)) !== JSON.stringify(manifest)) throw new Error('Stale voice manifest. Run npm run voice:assets.');
  if (JSON.stringify(read(path.join(root, 'public/voice-assets-manifest.json'))) !== JSON.stringify(manifest)) throw new Error('Stale public voice manifest. Run npm run voice:assets.');
  verifyFiles(target, manifest.hashes);
  console.log(`Voice assets verified: ONNX ${manifest.ortVersion}, VAD ${manifest.vadVersion}, revision ${manifest.revision}`);
}

function verifyFiles(target, hashes) {
  for (const [name, hash] of Object.entries(hashes)) {
    const file = path.join(target, name);
    if (!fs.existsSync(file) || sha(fs.readFileSync(file)) !== hash) throw new Error(`Missing/mismatched voice asset: ${name}`);
  }
}

function verifyVersions(pkg, lock, ort) {
  if (ort !== pkg.dependencies['onnxruntime-web'] || ort !== pkg.overrides['onnxruntime-web']) {
    throw new Error(`Installed ONNX ${ort} differs from the pinned runtime. Run npm ci before starting/building.`);
  }
  for (const [name, value] of Object.entries(lock.packages)) {
    if (name.endsWith('/onnxruntime-web') && value.version !== ort) throw new Error(`Duplicate ONNX version at ${name}`);
  }
}
if (require.main === module) run(process.argv.includes('--sync'));
module.exports = { collect, run, verifyFiles, verifyVersions };
