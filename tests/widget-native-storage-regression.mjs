import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));

for (const required of [
  'ios/App/App/WidgetSnapshotPlugin.swift',
  'ios/App/App/WavelengthBridgeViewController.swift',
  'ios/App/App/App.entitlements',
]) {
  assert.equal(exists(required), true, `${required} is required for App Group widget snapshot storage`);
}

const plugin = read('ios/App/App/WidgetSnapshotPlugin.swift');
assert.match(plugin, /class WidgetSnapshotPlugin:\s*CAPPlugin,\s*CAPBridgedPlugin/);
assert.match(plugin, /let jsName = "WidgetSnapshot"/);
assert.match(plugin, /CAPPluginMethod\(name:\s*"publish"/);
assert.match(plugin, /group\.com\.bocametrics\.wavelength/);
assert.match(plugin, /widget-snapshot-v1\.json/);
assert.match(plugin, /containerURL\(forSecurityApplicationGroupIdentifier:/);
assert.match(plugin, /data\.write\(to:\s*snapshotURL,\s*options:\s*\.atomic\)/,
  'the complete JSON payload is atomically replaced for cross-process readers');
assert.match(plugin, /schemaVersion[\s\S]*==\s*1/,
  'native storage rejects unsupported snapshot schemas');
assert.match(plugin, /64\s*\*\s*1024/,
  'native storage enforces the compact 64 KiB snapshot ceiling');
assert.match(plugin, /WidgetCenter\.shared\.reloadTimelines\(ofKind:\s*"WavelengthWidget"\)/,
  'publishing asks WidgetKit to reload only Wavelength timelines');

const controller = read('ios/App/App/WavelengthBridgeViewController.swift');
assert.match(controller, /class WavelengthBridgeViewController:\s*CAPBridgeViewController/);
assert.match(controller, /override open func capacitorDidLoad\(\)/);
assert.match(controller, /bridge\?\.registerPluginInstance\(WidgetSnapshotPlugin\(\)\)/);

const sceneDelegate = read('ios/App/App/SceneDelegate.swift');
assert.match(sceneDelegate, /window\?\.rootViewController\s*=\s*WavelengthBridgeViewController\(\)/,
  'the programmatic scene root must instantiate the custom controller that registers the plugin');

const entitlements = read('ios/App/App/App.entitlements');
assert.match(entitlements, /<key>com\.apple\.security\.application-groups<\/key>\s*<array>\s*<string>group\.com\.bocametrics\.wavelength<\/string>\s*<\/array>/);

const project = read('ios/App/App.xcodeproj/project.pbxproj');
for (const source of ['WidgetSnapshotPlugin.swift', 'WavelengthBridgeViewController.swift']) {
  assert.match(project, new RegExp(`${source.replace('.', '\\.') } in Sources`), `${source} must compile in the App target`);
}
assert.match(project, /App\.entitlements/);
assert.equal((project.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || []).length, 2,
  'Debug and Release both sign the App Group entitlement');

console.log('widget native App Group storage regression checks passed');
