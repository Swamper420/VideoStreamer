export function byId(id) {
  return document.getElementById(id);
}

export const defaultIceServers = Object.freeze([
  Object.freeze({ urls: 'stun:stun.l.google.com:19302' }),
  Object.freeze({ urls: 'stun:stun1.l.google.com:19302' }),
]);
export const defaultVideoFrameRate = 60;

export async function postJson(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? 'Request failed.');
  }

  return body;
}

export function setStatus(element, message) {
  element.textContent = message;
}

export function subscribeToEvents(sessionId, participantId, onSignal, onViewerJoined) {
  const events = new EventSource(`/api/sessions/${encodeURIComponent(sessionId)}/events?participantId=${encodeURIComponent(participantId)}`);
  events.addEventListener('signal', (event) => {
    onSignal(JSON.parse(event.data));
  });
  events.addEventListener('viewer-joined', (event) => {
    onViewerJoined(JSON.parse(event.data));
  });
  return events;
}

export function sendSignal(sessionId, message) {
  return postJson(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, message);
}

export function createRtcConfiguration() {
  return {
    iceServers: defaultIceServers.map((iceServer) => ({ ...iceServer })),
  };
}

function preferredCaptureNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? {
        ideal: value,
        max: value,
      }
    : undefined;
}

export function createDisplayMediaOptions(options = {}) {
  const frameRate = preferredCaptureNumber(options.frameRate) ?? preferredCaptureNumber(defaultVideoFrameRate);
  const width = preferredCaptureNumber(options.width);
  const height = preferredCaptureNumber(options.height);

  return {
    video: {
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      frameRate,
    },
    audio: options.audio ?? true,
  };
}

export function preferredVideoCodecs(preference = 'auto') {
  const capabilities = RTCRtpSender.getCapabilities?.('video');
  if (!capabilities?.codecs) {
    return [];
  }

  const preferredMimeTypesByOption = {
    auto: ['video/AV1', 'video/H264'],
    av1: ['video/AV1'],
    h264: ['video/H264'],
    vp9: ['video/VP9'],
    vp8: ['video/VP8'],
  };
  const preferredMimeTypes = preferredMimeTypesByOption[preference] ?? preferredMimeTypesByOption.auto;
  return capabilities.codecs.filter((codec) => preferredMimeTypes.includes(codec.mimeType));
}

function buildEncodingParameters(options = {}) {
  const encoding = {};

  if (typeof options.maxBitrate === 'number' && Number.isFinite(options.maxBitrate) && options.maxBitrate > 0) {
    encoding.maxBitrate = options.maxBitrate;
  }

  if (typeof options.frameRate === 'number' && Number.isFinite(options.frameRate) && options.frameRate > 0) {
    encoding.maxFramerate = options.frameRate;
  }

  return Object.keys(encoding).length > 0 ? encoding : null;
}

async function applyVideoSenderOptions(transceiver, options = {}) {
  const encoding = buildEncodingParameters(options);
  const sender = transceiver.sender;

  if (!encoding || !sender?.getParameters || !sender.setParameters) {
    return;
  }

  const parameters = sender.getParameters();
  const existingEncodings = Array.isArray(parameters.encodings) ? parameters.encodings : [];
  const [firstEncoding = {}, ...restEncodings] = existingEncodings;

  await sender.setParameters({
    ...parameters,
    encodings: [{ ...firstEncoding, ...encoding }, ...restEncodings],
  });
}

export async function attachStreamTracks(peerConnection, stream, options = {}) {
  const codecs = preferredVideoCodecs(options.codecPreference);
  const pendingSenderUpdates = [];

  for (const track of stream.getTracks()) {
    const transceiver = peerConnection.addTransceiver(track, {
      direction: 'sendonly',
      streams: [stream],
    });

    if (track.kind !== 'video') {
      continue;
    }

    if (typeof options.contentHint === 'string' && options.contentHint) {
      track.contentHint = options.contentHint;
    }

    if (codecs.length > 0) {
      transceiver.setCodecPreferences(codecs);
    }

    pendingSenderUpdates.push(applyVideoSenderOptions(transceiver, options));
  }

  await Promise.all(pendingSenderUpdates);
}
