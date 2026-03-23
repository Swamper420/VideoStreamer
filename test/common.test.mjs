import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachStreamTracks,
  createDisplayMediaOptions,
  createRtcConfiguration,
  defaultIceServers,
} from '../src/public/assets/common.js';

test('createRtcConfiguration returns STUN servers for remote connectivity', () => {
  const configuration = createRtcConfiguration();

  assert.deepEqual(configuration, {
    iceServers: defaultIceServers.map((iceServer) => ({ ...iceServer })),
  });
  assert.notEqual(configuration.iceServers, defaultIceServers);
  assert.equal(configuration.iceServers.length, 2);
});

test('createDisplayMediaOptions requests 60fps video and shared audio', () => {
  assert.deepEqual(createDisplayMediaOptions(), {
    video: {
      frameRate: {
        ideal: 60,
        max: 60,
      },
    },
    audio: true,
  });
});

test('attachStreamTracks adds video and audio tracks and only applies codec preferences to video', () => {
  const originalRtcRtpSender = globalThis.RTCRtpSender;
  const videoTrack = { kind: 'video', id: 'video-track' };
  const audioTrack = { kind: 'audio', id: 'audio-track' };
  const codecPreferencesCalls = [];
  const transceivers = [];
  const peerConnection = {
    addTransceiver(track, options) {
      transceivers.push({ track, options });
      return {
        setCodecPreferences(codecs) {
          codecPreferencesCalls.push({ track, codecs });
        },
      };
    },
  };
  const stream = {
    getTracks() {
      return [videoTrack, audioTrack];
    },
  };

  globalThis.RTCRtpSender = {
    getCapabilities(kind) {
      assert.equal(kind, 'video');
      return {
        codecs: [
          { mimeType: 'video/VP8' },
          { mimeType: 'video/H264' },
        ],
      };
    },
  };

  try {
    attachStreamTracks(peerConnection, stream);
  } finally {
    globalThis.RTCRtpSender = originalRtcRtpSender;
  }

  assert.deepEqual(transceivers, [
    {
      track: videoTrack,
      options: {
        direction: 'sendonly',
        streams: [stream],
      },
    },
    {
      track: audioTrack,
      options: {
        direction: 'sendonly',
        streams: [stream],
      },
    },
  ]);
  assert.deepEqual(codecPreferencesCalls, [
    {
      track: videoTrack,
      codecs: [{ mimeType: 'video/H264' }],
    },
  ]);
});
