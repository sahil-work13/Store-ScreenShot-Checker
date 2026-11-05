// Daily watcher: fetches each official spec page, hashes its main text, and records in status.json
// when it changed. Run by .github/workflows/watch-specs.yml; also runnable locally: node scripts/watch.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';

const rules = JSON.parse(fs.readFileSync('rules.json', 'utf8'));
const status = fs.existsSync('status.json') ? JSON.parse(fs.readFileSync('status.json', 'utf8')) : {};
const now = new Date().toISOString(), today = now.slice(0, 10), changed = [];

// main article text only: page chrome, scripts and per-load tokens would cause false alarms
export function mainText(html) {
  const m = html.match(/<main[\s\S]*?<\/main>/i) || html.match(/<article[\s\S]*?<\/article>/i) || html.match(/<body[\s\S]*<\/body>/i);
  return (m ? m[0] : html)
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|button)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

for (const [key, store] of Object.entries(rules.stores)) {
  const prev = status[key] || {};
  const next = { url: store.url, lastFetched: now, contentHash: prev.contentHash || null, changedOn: prev.changedOn || null, fetchError: null };
  try {
    const res = await fetch(store.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = mainText(await res.text());
    if (text.length < 500) throw new Error(`page text too short (${text.length} chars), layout may have changed`);
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    if (prev.contentHash && prev.contentHash !== hash) { next.changedOn = today; changed.push(store.name); }
    next.contentHash = hash;
  } catch (e) {
    next.fetchError = String(e.message || e);   // keep the last good hash
  }
  status[key] = next;
  console.log(`${store.name}: ${next.fetchError ? 'ERROR ' + next.fetchError : next.contentHash.slice(0, 12)}${changed.includes(store.name) ? ' (CHANGED)' : ''}`);
}

fs.writeFileSync('status.json', JSON.stringify(status, null, 2) + '\n');
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed.join(',')}\n`);
