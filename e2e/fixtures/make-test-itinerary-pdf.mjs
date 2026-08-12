// Generates two realistic test itineraries for exercising the upload ->
// extract -> parse -> confidence-scoring pipeline end to end:
//   - test-itinerary.pdf          — a real, selectable text layer (like a
//                                    genuine airline e-ticket PDF) -> takes
//                                    the "native-pdf" extraction path.
//   - test-itinerary-scanned.pdf  — the exact same content flattened to a
//                                    single full-page image with no text
//                                    layer (like a scanned/photographed
//                                    itinerary) -> forces the OCR fallback
//                                    path, useful for testing OCR quality.
//
// Content: a two-flight connection (KIN -> MIA -> JFK) plus a hotel stay,
// matching the Caribbean-focused airport dictionary (lib/data/airports.ts)
// and giving a real downstream connection to test the dependency engine /
// disruption recovery flow against.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 40px; font-size: 13px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #555; margin: 0 0 24px; }
  .section { border: 1px solid #ccc; border-radius: 4px; padding: 16px 20px; margin-bottom: 16px; }
  .section h2 { font-size: 14px; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #333; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 8px 3px 0; vertical-align: top; }
  td.label { color: #666; width: 160px; white-space: nowrap; }
  .route { font-size: 15px; font-weight: bold; margin-bottom: 8px; }
  .footer { color: #888; font-size: 11px; margin-top: 24px; }
</style>
</head>
<body>
  <h1>American Airlines — Electronic Ticket Itinerary &amp; Receipt</h1>
  <p class="sub">Booking Reference: <b>XJ7K2P</b> &nbsp;|&nbsp; Issued: November 2, 2026</p>

  <div class="section">
    <h2>Passenger</h2>
    <table>
      <tr><td class="label">Name</td><td>SMITH/JOHN MR</td></tr>
      <tr><td class="label">Ticket Number</td><td>0012345678901</td></tr>
      <tr><td class="label">Frequent Flyer</td><td>AAdvantage #JS4471209</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Flight 1 of 2</h2>
    <div class="route">Kingston (KIN) &rarr; Miami (MIA)</div>
    <table>
      <tr><td class="label">Flight</td><td>AA 123, Operated by American Airlines</td></tr>
      <tr><td class="label">Departure</td><td>Tue, Dec 15, 2026 &mdash; 2:30 PM, Terminal 1</td></tr>
      <tr><td class="label">Arrival</td><td>Tue, Dec 15, 2026 &mdash; 5:45 PM</td></tr>
      <tr><td class="label">Seat</td><td>14A, Economy (Main Cabin)</td></tr>
      <tr><td class="label">Gate</td><td>B12 (subject to change)</td></tr>
      <tr><td class="label">Baggage</td><td>1 checked bag included</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Flight 2 of 2 &mdash; Connection</h2>
    <div class="route">Miami (MIA) &rarr; New York JFK (JFK)</div>
    <table>
      <tr><td class="label">Flight</td><td>AA 456, Operated by American Airlines</td></tr>
      <tr><td class="label">Departure</td><td>Tue, Dec 15, 2026 &mdash; 7:30 PM, Terminal 2</td></tr>
      <tr><td class="label">Arrival</td><td>Tue, Dec 15, 2026 &mdash; 10:15 PM</td></tr>
      <tr><td class="label">Seat</td><td>22C, Economy (Main Cabin)</td></tr>
      <tr><td class="label">Connection Time</td><td>1h 45m in Miami</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Hotel</h2>
    <table>
      <tr><td class="label">Property</td><td>JFK Airport Marriott</td></tr>
      <tr><td class="label">Confirmation Number</td><td>MAR-88213045</td></tr>
      <tr><td class="label">Check-in</td><td>Tue, Dec 15, 2026, 3:00 PM</td></tr>
      <tr><td class="label">Check-out</td><td>Fri, Dec 18, 2026, 11:00 AM</td></tr>
      <tr><td class="label">Room Type</td><td>1 King Bed, Non-Smoking</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Fare</h2>
    <table>
      <tr><td class="label">Base Fare</td><td>USD 289.00</td></tr>
      <tr><td class="label">Taxes &amp; Fees</td><td>USD 60.00</td></tr>
      <tr><td class="label">Total</td><td><b>USD 349.00</b></td></tr>
    </table>
  </div>

  <p class="footer">
    For assistance, contact American Airlines Reservations at 1-800-433-7300 or reservations@aa.com.
    Manage your booking at aa.com/manage. This is not a boarding pass.
  </p>
</body>
</html>
`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });

// 1. Real text-layer PDF — the realistic case (genuine e-tickets are almost
//    always digitally generated, not scanned), exercises the fast
//    native-pdf extraction path (lib/extraction/pdfText.ts's
//    extractNativePdfText).
const pdfPath = path.join(__dirname, 'test-itinerary.pdf');
await page.pdf({ path: pdfPath, format: 'Letter', printBackground: true });
console.log('wrote', pdfPath, '(native text layer)');

// 2. Same content, flattened to a single full-resolution screenshot image
//    with zero text layer — simulates a scanned/photographed itinerary and
//    forces the OCR fallback path (lib/extraction/ocr.ts) so OCR quality
//    can actually be exercised/tested.
const screenshot = await page.screenshot({ fullPage: true });
await page.setContent(
  `<html><body style="margin:0"><img src="data:image/png;base64,${screenshot.toString('base64')}" style="width:100%;display:block"></body></html>`,
  { waitUntil: 'networkidle' }
);
const scannedPdfPath = path.join(__dirname, 'test-itinerary-scanned.pdf');
await page.pdf({ path: scannedPdfPath, format: 'Letter', printBackground: true });
console.log('wrote', scannedPdfPath, '(image only, no text layer — forces OCR)');

await browser.close();
