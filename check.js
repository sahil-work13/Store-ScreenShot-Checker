// Pure checking logic, shared by index.html and tests/check.test.mjs. No DOM here.

// Reads format and PNG header facts from the file's first bytes (not its extension).
export function inspect(bytes) {
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const info = { format: 'png', w: dv.getUint32(16), h: dv.getUint32(20), bitDepth: b[24], colorType: b[25], trns: false };
    // walk chunks until image data: a tRNS chunk means transparency even without an alpha channel
    for (let p = 8; p + 8 <= b.length;) {
      const len = dv.getUint32(p), type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
      if (type === 'tRNS') info.trns = true;
      if (type === 'IDAT' || type === 'IEND') break;
      p += 12 + len;
    }
    info.alpha = info.colorType === 4 || info.colorType === 6 || info.trns;
    info.is24bit = info.colorType === 2 && info.bitDepth === 8 && !info.trns;
    return info;
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { format: 'jpeg', alpha: false, is24bit: true };
  return { format: 'unknown', alpha: false, is24bit: false };
}

const sizeMatch = (slot, w, h) => (slot.sizes || []).some(([a, c]) => (w === a && h === c) || (!slot.landscapeOnly && w === c && h === a));

// Picks a slot from folder/file name hints first, then from an exact size match.
export function guessSlot(rules, path, w, h) {
  const p = path.toLowerCase();
  const hinted = rules.slots.filter(s => s.hints.some(k => p.includes(k)));
  if (hinted.length) return (hinted.find(s => sizeMatch(s, w, h)) || hinted[0]).id;
  const exact = rules.slots.find(s => sizeMatch(s, w, h));
  if (exact) return exact.id;
  const phone = rules.slots.find(s => s.id === 'play-phone');
  return phone && fits(phone, w, h).length === 0 ? phone.id : '';
}

function fits(slot, w, h) {
  const errs = [], lo = Math.min(w, h), hi = Math.max(w, h);
  if (slot.sizes && !sizeMatch(slot, w, h))
    errs.push(`size ${w}×${h} isn't accepted; allowed: ${slot.sizes.map(([a, c]) => `${a}×${c}`).join(', ')}${slot.landscapeOnly ? '' : ' (or landscape)'}`);
  if (slot.minSide && lo < slot.minSide) errs.push(`shortest side ${lo}px is under ${slot.minSide}px`);
  if (slot.maxSide && hi > slot.maxSide) errs.push(`longest side ${hi}px is over ${slot.maxSide}px`);
  if (slot.maxLongToShort && hi > slot.maxLongToShort * lo) errs.push(`long side is more than ${slot.maxLongToShort}× the short side`);
  if (slot.ratios && !slot.ratios.some(([a, c]) => w * c === h * a)) errs.push(`aspect ratio isn't ${slot.ratios.map(r => r.join(':')).join(' or ')}`);
  return errs;
}

// → { status: 'pass'|'warn'|'fail', reasons: [] } for one image in one slot
export function checkImage(rules, slotId, info, w, h) {
  const slot = rules.slots.find(s => s.id === slotId);
  if (!slot) return { status: 'fail', reasons: ['no slot matches this image; pick one'] };
  const store = rules.stores[slot.store], fail = [], warn = [];
  if (!store.formats.includes(info.format)) fail.push(`format ${info.format} isn't allowed (${store.formats.join(', ')})`);
  fail.push(...fits(slot, w, h));
  if (slot.noAlpha && info.alpha) fail.push('has an alpha channel or transparency');
  if (slot.png24 && info.format === 'png' && !info.is24bit) fail.push(info.alpha ? 'has alpha; must be 24-bit PNG with no alpha' : 'PNG is not 24-bit RGB');
  if (slot.recommend) {
    const [a, c] = slot.recommend.ratio, [mw, mh] = slot.recommend.minSize;
    const portrait = h >= w, ok = portrait ? w * c === h * a && w >= mw && h >= mh : w * a === h * c && w >= mh && h >= mw;
    if (!ok) warn.push(`recommended ${a}:${c} at ${mw}×${mh} or more (for promotion eligibility)`);
  }
  return { status: fail.length ? 'fail' : warn.length ? 'warn' : 'pass', reasons: [...fail, ...warn] };
}

// → per used slot: { slot, n, status, reason }
export function checkCounts(rules, slotIds) {
  const n = {};
  slotIds.filter(Boolean).forEach(id => { n[id] = (n[id] || 0) + 1; });
  return Object.entries(n).map(([id, count]) => {
    const s = rules.slots.find(x => x.id === id);
    const bad = count < s.min ? `needs at least ${s.min}` : count > s.max ? `allows at most ${s.max}` : '';
    return { slot: s, n: count, status: bad ? 'fail' : 'pass', reason: bad ? `${count} images; ${s.label} ${bad}` : `${count} of max ${s.max}` };
  });
}

// true when the official page changed after the rules were last verified
export const isStale = (store, st) => !!(st && st.changedOn && st.changedOn > store.verifiedOn);
