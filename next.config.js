/** @type {import('next').NextConfig} */
const nextConfig = {
  // These packages spawn worker threads / native bindings that read files
  // relative to their own location in node_modules at runtime. Bundling them
  // breaks that (Tesseract.js's worker script goes missing in .next/server).
  // Keeping them external means Next.js requires them directly instead.
  serverExternalPackages: ['tesseract.js', '@napi-rs/canvas', 'pdfjs-dist'],
};

module.exports = nextConfig;
