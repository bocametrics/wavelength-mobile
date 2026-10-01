import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const widgetSource = read('ios/App/WavelengthWidget/WavelengthWidget.swift');
const widgetInfo = read('ios/App/WavelengthWidget/Info.plist');
const widgetEntitlements = read('ios/App/WavelengthWidget/WavelengthWidget.entitlements');
const project = read('ios/App/App.xcodeproj/project.pbxproj');
const capacitorPackage = read('ios/App/CapApp-SPM/Package.swift');

assert.match(widgetSource, /import WidgetKit/);
assert.match(widgetSource, /import SwiftUI/);
assert.match(widgetSource, /static let kind\s*=\s*"WavelengthWidget"/);
assert.match(widgetSource, /group\.com\.bocametrics\.wavelength/);
assert.match(widgetSource, /widget-snapshot-v1\.json/);
assert.match(widgetSource, /64\s*\*\s*1024/);
assert.match(widgetSource, /schemaVersion\s*==\s*1/);
assert.match(widgetSource, /snapshot\.generatedAt\s*<=\s*now/);
assert.match(widgetSource, /snapshot\.revision\s*==\s*expectedRevision/);
assert.match(widgetSource, /snapshot\.nextRefreshAt\s*<=\s*snapshot\.expiresAt/);
assert.match(widgetSource, /snapshot\.expiresAt\s*>\s*now/);
assert.match(widgetSource, /snapshot\.dayKey\s*==\s*localDayKey/);
assert.match(widgetSource, /progress\.completed\s*>=\s*0/);
assert.match(widgetSource, /progress\.completed\s*<=\s*progress\.total/);
assert.match(widgetSource, /data\.count\s*<=\s*maximumSnapshotBytes/);

assert.match(widgetSource, /Timeline\(entries:\s*\[currentEntry,\s*expiryEntry\]/,
  'timeline must include a fail-closed entry at local-midnight expiry');
assert.match(widgetSource, /expiryEntry\s*=.*date:\s*snapshot\.expiresAt/s);
assert.match(widgetSource, /supportedFamilies\(\[\.systemSmall\]\)/,
  'Phase 2 must expose only systemSmall');
assert.doesNotMatch(widgetSource, /\.systemMedium|\.systemLarge/,
  'later widget families are out of Phase 2 scope');

assert.match(widgetSource, /@Environment\(\\\.widgetRenderingMode\)/);
assert.match(widgetSource, /case \.fullColor:/);
assert.match(widgetSource, /case \.accented:/);
assert.match(widgetSource, /case \.vibrant:/);
assert.match(widgetSource, /\.widgetAccentable\(\)/);
assert.match(widgetSource, /\.containerBackground\(for:\s*\.widget\)/);
assert.match(widgetSource, /\.privacySensitive\(\)/);
assert.match(widgetSource, /Circle\(\)/);
assert.match(widgetSource, /\.trim\(from:\s*0,\s*to:/);
assert.match(widgetSource, /Text\("COMPLETED"\)/,
  'the progress caption must explain what the completed/total count represents');
assert.doesNotMatch(widgetSource, /Text\("TODAY"\)/,
  'today is implicit in the widget and must not replace the progress meaning');
assert.match(widgetSource, /Text\("WAVELENGTH"\)[\s\S]*?\.font\(\.system\(size:\s*9,\s*weight:\s*\.semibold\)\)/,
  'the brand label must remain visually secondary to the progress ring');
assert.match(widgetSource, /progress\.total\s*==\s*1\s*\?\s*"habit"\s*:\s*"habits"/,
  'VoiceOver progress copy must use singular and plural habit grammar');
assert.match(widgetSource, /Open Wavelength/,
  'missing or invalid data must render an honest recovery state');
assert.doesNotMatch(widgetSource, /\bButton\s*\(|\bToggle\s*\(|AppIntent/,
  'Phase 2 remains read-only');

assert.match(widgetInfo, /<string>com\.apple\.widgetkit-extension<\/string>/);
assert.match(widgetEntitlements, /<string>group\.com\.bocametrics\.wavelength<\/string>/);

assert.match(project, /WavelengthWidget\.appex/);
assert.match(project, /productType = "com\.apple\.product-type\.app-extension"/);
assert.match(project, /WavelengthWidget\.swift in Sources/);
assert.match(project, /WavelengthWidget\.appex in Embed Foundation Extensions/);
assert.match(project, /PBXTargetDependency/);
assert.match(project, /CODE_SIGN_ENTITLEMENTS = WavelengthWidget\/WavelengthWidget\.entitlements;/g);
assert.equal((project.match(/CODE_SIGN_ENTITLEMENTS = WavelengthWidget\/WavelengthWidget\.entitlements;/g) || []).length, 2,
  'widget Debug and Release must both use App Group entitlements');
assert.equal((project.match(/PRODUCT_BUNDLE_IDENTIFIER = com\.bocametrics\.wavelength\.WavelengthWidget;/g) || []).length, 2,
  'widget Debug and Release need the extension bundle identifier');
assert.equal((project.match(/IPHONEOS_DEPLOYMENT_TARGET = 17\.0;/g) || []).length, 2,
  'widget Debug and Release deployment targets must match');
assert.doesNotMatch(project, /DEVELOPMENT_TEAM\s*=/,
  'Personal Team identifiers must remain local and uncommitted');
assert.match(capacitorPackage, /platforms:\s*\[\.iOS\(\.v15\)\]/,
  'adding an iOS 17 widget must not raise the Capacitor app package above its iOS 15 deployment target');

console.log('systemSmall WidgetKit regression checks passed');
