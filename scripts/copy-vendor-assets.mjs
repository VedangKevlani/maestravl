// Serves browser-side runtime files from our own origin, copied out of
// node_modules on every install (package.json "postinstall"). Each lands
// under a versioned name, so a stale copy 404s loudly instead of mixing
// versions, and nothing executable is fetched from a third-party CDN.
//
// - MapLibre's web worker: MapLibre locates it relative to its own module
//   URL, which isn't an http(s) URL once Next bundles it — without this the
//   worker silently fails and so do all vector tiles and GeoJSON (found
//   2026-10-12). Used by app/components/map/TripMapView.tsx.
// - The ONNX Runtime WebAssembly build that Transformers.js runs Kokoro TTS
//   on (app/components/chat/kokoro.worker.ts). Transformers.js would
//   otherwise download it from cdn.jsdelivr.net at runtime.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const vendor = path.join(process.cwd(), 'public', 'vendor')

// Read straight from node_modules — some packages (transformers.js) don't
// expose package.json through their "exports" map.
function pkg(name) {
  const dir = path.join(process.cwd(), 'node_modules', name)
  return { dir, version: JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).version }
}

const maplibre = pkg('maplibre-gl')
mkdirSync(vendor, { recursive: true })
copyFileSync(path.join(maplibre.dir, 'dist', 'maplibre-gl-worker.mjs'), path.join(vendor, `maplibre-gl-worker-${maplibre.version}.mjs`))
console.log(`maplibre worker ${maplibre.version} -> public/vendor/`)

const transformers = pkg('@huggingface/transformers')
const ortDir = path.join(vendor, `transformers-${transformers.version}`)
mkdirSync(ortDir, { recursive: true })
for (const file of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
  copyFileSync(path.join(transformers.dir, 'dist', file), path.join(ortDir, file))
}
console.log(`onnxruntime wasm (transformers ${transformers.version}) -> public/vendor/transformers-${transformers.version}/`)
