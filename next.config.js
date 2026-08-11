/** @type {import('next').NextConfig} */
const nextConfig = {
  // These packages spawn worker threads / native bindings that read files
  // relative to their own location in node_modules at runtime. Bundling them
  // breaks that (Tesseract.js's worker script goes missing in .next/server).
  // Keeping them external means Next.js requires them directly instead.
  serverExternalPackages: ['tesseract.js', '@napi-rs/canvas', 'pdfjs-dist'],
  // pdfjs-dist loads @napi-rs/canvas itself via a dynamic `createRequire()`
  // call (needed for its DOMMatrix/Path2D Node polyfill), which Vercel's
  // build-time file tracer doesn't follow — the package gets built locally
  // but silently dropped from the deployed function, throwing "Cannot find
  // module '@napi-rs/canvas'" at runtime. Force-include it explicitly.
  outputFileTracingIncludes: {
    '/api/upload': ['./node_modules/@napi-rs/canvas*/**/*'],
  },
};

module.exports = nextConfig;
