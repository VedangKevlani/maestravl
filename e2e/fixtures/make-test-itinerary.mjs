// Generates a synthetic scanned-itinerary image (e2e/fixtures/test-itinerary.png)
// used by e2e/upload.mjs to exercise the OCR + parsing pipeline without
// needing a real travel document.
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const width = 900, height = 700;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, width, height);
ctx.fillStyle = '#000000';
ctx.font = 'bold 28px sans-serif';
ctx.fillText('American Airlines - E-Ticket Itinerary', 40, 50);

ctx.font = '18px sans-serif';
const lines = [
  '',
  'Passenger: SMITH/JOHN MR',
  'Booking Reference: XJ7K2P',
  '',
  'Flight AA123',
  'Departure: Kingston (KIN) Terminal 1',
  'Arrival: Miami (MIA)',
  'Departure Time: Dec 15, 2026 2:30 PM',
  'Arrival Time: Dec 15, 2026 5:45 PM',
  'Seat: 14A',
  'Cabin: Economy',
  'Gate: B12',
  '',
  'Ticket Number: 0012345678901',
  'Fare: USD 349.00',
];
let y = 100;
for (const line of lines) {
  ctx.fillText(line, 40, y);
  y += 32;
}

const outPath = path.join(__dirname, 'test-itinerary.png');
fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
console.log('wrote', outPath);
