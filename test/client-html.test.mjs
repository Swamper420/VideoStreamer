import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('client viewer video does not expose native media controls that steal input clicks', async () => {
  const clientHtml = await readFile(
    new URL('../src/public/client.html', import.meta.url),
    'utf8',
  );

  assert.match(clientHtml, /<video id="viewer-video" autoplay playsinline><\/video>/);
  assert.doesNotMatch(clientHtml, /<video id="viewer-video"[^>]*\scontrols(?:\s|>)/);
});
