/** @type {import('next').NextConfig} */
const nextConfig = {
  // These packages spawn worker threads / native bindings that read files
  // relative to their own location in node_modules at runtime. Bundling them
  // breaks that (Tesseract.js's worker script goes missing in .next/server).
  // Keeping them external means Next.js requires them directly instead.
  serverExternalPackages: ['tesseract.js', '@napi-rs/canvas', 'pdfjs-dist'],
  // pdfjs-dist and tesseract.js both pull in files Vercel's build-time file
  // tracer can't see statically: pdfjs-dist loads @napi-rs/canvas via a
  // dynamic `createRequire()` call (its DOMMatrix/Path2D Node polyfill) and
  // loads its own pdf.worker.mjs the same indirect way; tesseract.js-core's
  // .js wrappers each load a same-named .wasm binary the tracer doesn't
  // follow either. All of these built locally but were silently dropped
  // from the deployed function, throwing "Cannot find module" at runtime.
  // Force-include them explicitly.
  outputFileTracingIncludes: {
    '/api/upload': [
      './node_modules/@napi-rs/canvas*/**/*',
      './node_modules/pdfjs-dist/legacy/build/**/*',
      './node_modules/tesseract.js-core/**/*',
      './node_modules/tesseract.js/src/worker-script/**/*',
    ],
  },
  // Cross-origin isolation lets the in-browser Kokoro voice
  // (app/components/chat/kokoro.worker.ts) run on several CPU threads
  // instead of one — WebAssembly threads need SharedArrayBuffer, which
  // browsers only enable on isolated pages. `credentialless` (rather than
  // `require-corp`) keeps cross-origin map tiles, fonts and Wikipedia
  // working: they load without cookies, which none of them need. Browsers
  // that don't support it simply aren't isolated and use one thread.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ]
  },
};

module.exports = nextConfig;
