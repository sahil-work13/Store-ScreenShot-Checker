// Self-check for check.js: node tests/check.test.mjs (exits non-zero on failure)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inspect, guessSlot, checkImage, checkCounts, isStale } from '../check.js';

const rules = JSON.parse(fs.readFileSync(new URL('../rules.json', import.meta.url), 'utf8'));

// minimal PNG header: signature + IHDR (+ optional tRNS) + IDAT; CRCs aren't read by inspect()
function png(w, h, colorType = 2, trns = false) {
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = colorType;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    ...(trns ? [chunk('tRNS', Buffer.from([0, 0]))] : []), chunk('IDAT', Buffer.from([0]))]));
}
const run = (slot, w, h, ct, trns) => checkImage(rules, slot, inspect(png(w, h, ct, trns)), w, h);

// header parsing
assert.deepEqual([inspect(png(10, 20)).w, inspect(png(10, 20)).h, inspect(png(10, 20)).alpha], [10, 20, false]);
assert.equal(inspect(png(10, 20, 6)).alpha, true);
assert.equal(inspect(png(10, 20, 2, true)).alpha, true);
assert.equal(inspect(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])).format, 'jpeg');
assert.equal(inspect(new Uint8Array([1, 2, 3, 4])).format, 'unknown');

// Apple
assert.equal(run('iphone-large', 1320, 2868).status, 'pass');
assert.equal(run('iphone-large', 2868, 1320).status, 'pass', 'landscape allowed');
assert.equal(run('iphone-large', 1320, 2868, 6).status, 'fail', 'alpha channel');
assert.equal(run('iphone-large', 1300, 2868).status, 'fail', 'wrong size');
assert.equal(run('ipad-13', 2048, 2732).status, 'pass');

// Google
assert.equal(run('play-phone', 1080, 1920).status, 'pass');
assert.equal(run('play-phone', 1080, 2400).status, 'fail', 'long side over 2x short');
assert.equal(run('play-phone', 1000, 1800).status, 'warn', 'valid but not the recommended 9:16 1080x1920');
assert.equal(run('play-phone', 1080, 1920, 6).status, 'fail', 'not 24-bit');
assert.equal(run('play-tablet', 1200, 1920).status, 'fail', '1200x1920 is not 9:16');
assert.equal(run('play-tablet', 1080, 1920).status, 'pass');
assert.equal(run('play-feature', 1024, 500).status, 'pass');
assert.equal(run('play-feature', 500, 1024).status, 'fail', 'feature graphic is landscape only');

// slot guessing from folder names and sizes
assert.equal(guessSlot(rules, 'final/google-play-phone/01.png', 1080, 1920), 'play-phone');
assert.equal(guessSlot(rules, 'final/google-play-tablet-7in/01.png', 1200, 1920), 'play-tablet');
assert.equal(guessSlot(rules, 'final/app-store-ipad-13in/01.png', 2048, 2732), 'ipad-13');
assert.equal(guessSlot(rules, 'final/app-store-iphone-6.9in/01.png', 1320, 2868), 'iphone-large');
assert.equal(guessSlot(rules, 'x.png', 1024, 500), 'play-feature');
assert.equal(guessSlot(rules, 'x.png', 1290, 2796), 'iphone-large');

// counts
assert.equal(checkCounts(rules, Array(9).fill('play-phone'))[0].status, 'fail', 'max 8 on Play');
assert.equal(checkCounts(rules, Array(8).fill('play-phone'))[0].status, 'pass');
assert.equal(checkCounts(rules, Array(3).fill('play-tablet'))[0].status, 'fail', 'tablets need 4');
assert.equal(checkCounts(rules, Array(11).fill('iphone-large'))[0].status, 'fail', 'max 10 on Apple');

// banner logic
assert.equal(isStale({ verifiedOn: '2026-11-05' }, { changedOn: '2026-12-01' }), true);
assert.equal(isStale({ verifiedOn: '2026-11-05' }, { changedOn: null }), false);
assert.equal(isStale({ verifiedOn: '2026-12-02' }, { changedOn: '2026-12-01' }), false);

console.log('all checks passed');
