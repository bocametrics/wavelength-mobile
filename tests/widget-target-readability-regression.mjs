import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'ios/App/WavelengthWidget/WavelengthWidget.swift'),'utf8');
const view=source.slice(source.indexOf('private func nextWaveView'),source.indexOf('private var nextWaveUnavailableView'));
assert(view.includes('Text(nextWave.title)')&&view.includes('Text(nextWave.targetLabel)'),'actual production recommendation view must contain title and target');
const title=view.slice(view.indexOf('Text(nextWave.title)'),view.indexOf('if !nextWave.targetLabel.isEmpty'));
const suffix=view.slice(view.indexOf('if !nextWave.targetLabel.isEmpty'),view.indexOf('Text(nextWave.detail)'));
const dot=suffix.slice(suffix.indexOf('Text("·")'),suffix.indexOf('Text(nextWave.targetLabel)'));
const target=suffix.slice(suffix.indexOf('Text(nextWave.targetLabel)'));
const priority=block=>{
 const matches=[...block.matchAll(/\.layoutPriority\(\s*(-?\d+(?:\.\d+)?)\s*\)/g)];
 assert(matches.length<=1,'source contract must not hide multiple competing layout priorities');
 return matches.length?Number(matches[0][1]):0;
};
const protectedWidth=block=>/\.fixedSize\(\s*horizontal:\s*true,\s*vertical:\s*false\s*\)/.test(block);
assert.match(title,/\.lineLimit\(1\)[\s\S]*?\.truncationMode\(\.tail\)/,'the long habit title remains a one-line truncatable title');
assert.match(source,/@ScaledMetric\(relativeTo:\s*\.title3\)\s*private var recommendationTitleSize:\s*CGFloat\s*=\s*19\b/,'approved modestly smaller Dynamic-Type-relative habit font stays 19');
assert.match(title,/\.font\(\.system\(size:\s*recommendationTitleSize,\s*weight:\s*\.semibold\)\)/);
assert.doesNotMatch(title,/minimumScaleFactor/,'do not shrink the habit font to bypass target clipping');
assert.match(target,/\.font\(\.system\(size:\s*13,\s*weight:\s*\.semibold\)\)[\s\S]*?\.lineLimit\(1\)[\s\S]*?\.minimumScaleFactor\(0\.8\)/,'keep target typography and existing scaling policy unchanged');
assert(priority(title)<=priority(target)||protectedWidth(target),'truncatable title must not outrank and starve the target label');
assert(priority(title)<=priority(dot)||protectedWidth(dot),'truncatable title must not outrank and starve the target separator');
console.log('PASS: native medium title/target source allocation contract; native WidgetKit pixels and AX width remain separate required gates.');
