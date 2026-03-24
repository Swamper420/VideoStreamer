import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('client viewer video does not expose native media controls that steal input clicks', async () => {
  const clientHtml = await readFile(
    new URL('../src/public/client.html', import.meta.url),
    'utf8',
  );
  const viewerVideoTag = clientHtml.match(/<video\b[^>]*id="viewer-video"[^>]*>/)?.[0];

  assert.ok(viewerVideoTag, 'Expected client.html to include the viewer video element.');
  assert.match(viewerVideoTag, /id="viewer-video"/);
  assert.match(viewerVideoTag, /\bautoplay\b/);
  assert.match(viewerVideoTag, /\bplaysinline\b/);
  assert.doesNotMatch(viewerVideoTag, /\bcontrols(?=\s|>|=)/);
});
