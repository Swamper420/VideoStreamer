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

test('createDisplayMediaOptions applies custom resolution, frame rate, and audio settings', () => {
  assert.deepEqual(createDisplayMediaOptions({
    audio: false,
    width: 1920,
    height: 1080,
    frameRate: 30,
  }), {
    video: {
      width: {
        ideal: 1920,
        max: 1920,
      },
      height: {
        ideal: 1080,
        max: 1080,
      },
      frameRate: {
        ideal: 30,
        max: 30,
      },
    },
    audio: false,
  });
});

test('attachStreamTracks adds video and audio tracks and applies codec and sender preferences to video', async () => {
  const originalRtcRtpSender = globalThis.RTCRtpSender;
  const videoTrack = { kind: 'video', id: 'video-track', contentHint: '' };
  const audioTrack = { kind: 'audio', id: 'audio-track' };
  const codecPreferencesCalls = [];
  const senderParametersCalls = [];
  const transceivers = [];
  const peerConnection = {
    addTransceiver(track, options) {
      transceivers.push({ track, options });
      return {
        setCodecPreferences(codecs) {
          codecPreferencesCalls.push({ track, codecs });
        },
        sender: {
          getParameters() {
            return {};
          },
          async setParameters(parameters) {
            senderParametersCalls.push({ track, parameters });
          },
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
          { mimeType: 'video/VP9' },
          { mimeType: 'video/H264' },
        ],
      };
    },
  };

  try {
    await attachStreamTracks(peerConnection, stream, {
      codecPreference: 'vp9',
      contentHint: 'text',
      maxBitrate: 5_000_000,
      frameRate: 30,
    });
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
      codecs: [{ mimeType: 'video/VP9' }],
    },
  ]);
  assert.equal(videoTrack.contentHint, 'text');
  assert.deepEqual(senderParametersCalls, [
    {
      track: videoTrack,
      parameters: {
        encodings: [{
          maxBitrate: 5_000_000,
          maxFramerate: 30,
        }],
      },
    },
  ]);
});
