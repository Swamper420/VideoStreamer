import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLinuxInputBridgeCommand,
  shouldPreferLinuxInputBridge,
} from '../src/public/assets/host-bridge.js';

test('shouldPreferLinuxInputBridge defaults to bridge mode for remote Linux hosts', () => {
  assert.equal(shouldPreferLinuxInputBridge({
    platform: 'Linux x86_64',
    hostname: 'stream.example.com',
  }), true);
  assert.equal(shouldPreferLinuxInputBridge({
    platform: 'Linux x86_64',
    hostname: 'localhost',
  }), false);
  assert.equal(shouldPreferLinuxInputBridge({
    platform: 'Win32',
    hostname: 'stream.example.com',
  }), false);
});

test('buildLinuxInputBridgeCommand produces a copy-pasteable bridge command', () => {
  const command = buildLinuxInputBridgeCommand({
    serverOrigin: 'https://stream.example.com',
    sessionId: 'session-123',
    hostId: 'host-456',
    controlToken: 'token-789',
  });

  assert.equal(
    command,
    "VIDEO_STREAMER_SERVER_URL='https://stream.example.com' " +
      "VIDEO_STREAMER_SESSION_ID='session-123' " +
      "VIDEO_STREAMER_HOST_ID='host-456' " +
      "VIDEO_STREAMER_CONTROL_TOKEN='token-789' npm run input-bridge",
  );
});

test('buildLinuxInputBridgeCommand safely escapes shell-special characters in values', () => {
  const command = buildLinuxInputBridgeCommand({
    serverOrigin: 'https://stream.example.com/$HOME',
    sessionId: "session-'123'",
    hostId: 'host-`456`',
    controlToken: 'token-$(rm -rf /)',
  });

  assert.equal(
    command,
    "VIDEO_STREAMER_SERVER_URL='https://stream.example.com/$HOME' " +
      "VIDEO_STREAMER_SESSION_ID='session-'\\''123'\\''' " +
      "VIDEO_STREAMER_HOST_ID='host-`456`' " +
      "VIDEO_STREAMER_CONTROL_TOKEN='token-$(rm -rf /)' npm run input-bridge",
  );
});
