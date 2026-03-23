import test from 'node:test';
import assert from 'node:assert/strict';
import { createRtcConfiguration, defaultIceServers } from '../src/public/assets/common.js';

test('createRtcConfiguration returns STUN servers for remote connectivity', () => {
  const configuration = createRtcConfiguration();

  assert.deepEqual(configuration, {
    iceServers: defaultIceServers.map((iceServer) => ({ ...iceServer })),
  });
  assert.notEqual(configuration.iceServers, defaultIceServers);
  assert.equal(configuration.iceServers.length >= 2, true);
});
