import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const output = resolve('.output/chrome-mv3');
const manifest = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8'));

assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['storage']);
assert.equal(manifest.host_permissions?.length ?? 0, 0);
assert.equal(manifest.optional_permissions?.length ?? 0, 0);
assert.equal(manifest.optional_host_permissions?.length ?? 0, 0);
assert.equal(manifest.web_accessible_resources?.length ?? 0, 0);
assert.equal(manifest.chrome_url_overrides, undefined);
assert.equal(manifest.content_scripts.length, 1);
assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.tiktok.com/*']);
assert.equal(manifest.content_scripts[0].all_frames ?? false, false);
assert.equal(manifest.action.default_popup, 'popup.html');
assert.equal(manifest.options_ui.page, 'options.html');
assert.ok(manifest.background.service_worker);

await Promise.all(
  [
    'popup.html',
    'history.html',
    'options.html',
    manifest.background.service_worker,
    ...manifest.content_scripts[0].js,
  ].map((file) => access(resolve(output, file))),
);

process.stdout.write('Verified Chrome MV3 output, entrypoints, and least-privilege manifest.\n');
