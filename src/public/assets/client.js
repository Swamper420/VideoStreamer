import { byId, createRtcConfiguration, postJson, sendSignal, setStatus, subscribeToEvents } from './common.js';

const viewerNameInput = byId('viewer-name');
const sessionIdInput = byId('session-id');
const joinButton = byId('join-session');
const statusText = byId('client-status');
const viewerVideo = byId('viewer-video');

let sessionId = new URLSearchParams(window.location.search).get('sessionId') ?? '';
let participantId = '';
let hostId = '';
let inputChannel = null;
let peerConnection = null;
const pendingIceCandidates = [];
let hasRemoteDescription = false;

function clampNormalizedCoordinate(value) {
  if (!Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(1, Math.max(0, value));
}

sessionIdInput.value = sessionId;

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(createRtcConfiguration());

  peerConnection.addEventListener('track', (event) => {
    const [stream] = event.streams;
    if (stream) {
      viewerVideo.srcObject = stream;
    }
  });

  peerConnection.addEventListener('icecandidate', (event) => {
    if (event.candidate) {
      void sendSignal(sessionId, {
        from: participantId,
        to: hostId,
        type: 'ice-candidate',
        payload: event.candidate,
      });
    }
  });

  peerConnection.addEventListener('datachannel', (event) => {
    inputChannel = event.channel;
    inputChannel.addEventListener('open', () => {
      setStatus(statusText, 'Connected. Input forwarding is ready.');
    });
  });
}

async function handleSignal(message) {
  if (message.type === 'offer') {
    hostId = message.from;
    createPeerConnection();
    await peerConnection.setRemoteDescription(message.payload);
    hasRemoteDescription = true;

    while (pendingIceCandidates.length > 0) {
      const candidate = pendingIceCandidates.shift();
      await peerConnection.addIceCandidate(candidate);
    }

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    await sendSignal(sessionId, {
      from: participantId,
      to: hostId,
      type: 'answer',
      payload: answer,
    });
    return;
  }

  if (message.type === 'ice-candidate' && peerConnection && message.payload) {
    if (!hasRemoteDescription) {
      pendingIceCandidates.push(message.payload);
      return;
    }

    await peerConnection.addIceCandidate(message.payload);
  }
}

function forwardInput(type, payload) {
  if (!inputChannel || inputChannel.readyState !== 'open') {
    return;
  }

  inputChannel.send(JSON.stringify({ type, payload }));
}

function registerInputHandlers() {
  viewerVideo.tabIndex = 0;

  viewerVideo.addEventListener('mousemove', (event) => {
    const bounds = viewerVideo.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return;
    }

    const x = clampNormalizedCoordinate((event.clientX - bounds.left) / bounds.width);
    const y = clampNormalizedCoordinate((event.clientY - bounds.top) / bounds.height);
    if (x === undefined || y === undefined) {
      return;
    }

    forwardInput('mousemove', {
      x: Number(x.toFixed(4)),
      y: Number(y.toFixed(4)),
    });
  });

  viewerVideo.addEventListener('click', (event) => {
    viewerVideo.focus();
    forwardInput('click', { button: event.button });
  });

  viewerVideo.addEventListener('wheel', (event) => {
    forwardInput('wheel', {
      deltaX: event.deltaX,
      deltaY: event.deltaY,
    });
  });

  viewerVideo.addEventListener('keydown', (event) => {
    forwardInput('keydown', {
      code: event.code,
      key: event.key,
    });
  });
}

async function joinSession() {
  sessionId = sessionIdInput.value.trim();
  if (!sessionId) {
    setStatus(statusText, 'Enter a session ID.');
    return;
  }

  joinButton.disabled = true;
  setStatus(statusText, 'Joining the session.');

  try {
    const joined = await postJson(`/api/sessions/${encodeURIComponent(sessionId)}/participants`, {
      viewerName: viewerNameInput.value,
    });

    participantId = joined.participantId;
    subscribeToEvents(sessionId, participantId, handleSignal, () => {});
    registerInputHandlers();
    setStatus(statusText, 'Waiting for the host to answer.');
  } catch (error) {
    setStatus(statusText, error instanceof Error ? error.message : 'Unable to join the session.');
    joinButton.disabled = false;
  }
}

joinButton.addEventListener('click', () => {
  void joinSession();
});
