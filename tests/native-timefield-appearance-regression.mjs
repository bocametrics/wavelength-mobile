import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
for(const [label,file] of [['mobile','../index.html'],['shared fixture','fixtures/friday_app_2026-07-12.html']]) {
 const html=fs.readFileSync(path.resolve(here,file),'utf8');
 const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
 const rules=[...css.matchAll(/#nextWaveNotificationTime\s*\{([^}]+)\}/g)].map(m=>m[1]).join('\n');
 assert.match(rules,/-webkit-appearance:\s*none\s*;/,`${label}: scoped native time-field appearance must release WKWebView's forced content-box sizing`);
 assert.match(rules,/(?:^|[;\s])appearance:\s*none\s*;/,`${label}: standard appearance property accompanies the WebKit declaration`);
 assert.doesNotMatch(rules,/overflow(?:-x)?:\s*(?:hidden|clip)|(?:width|max-width):\s*\d+px|margin-right:\s*-/,`${label}: containment cannot be faked with clipping, fixed width or a negative gutter`);
 const input=html.match(/<input[^>]*id="nextWaveNotificationTime"[^>]*>/)?.[0];assert.ok(input);
 assert.match(input,/type="time"/,`${label}: native time input and picker semantics are retained`);
 assert.match(html,/<label[^>]*class="settings-field"[^>]*>[\s\S]*?<span>Reminder time<\/span>[\s\S]*?id="nextWaveNotificationTime"/,`${label}: existing accessible native field association remains`);
 assert.match(css,/\.settings-field input\s*\{[^}]*min-height:\s*44px/,`${label}: usable 44px field height is preserved`);
 console.log(`${label}: native time-field root-cause CSS contracts passed`);
}
