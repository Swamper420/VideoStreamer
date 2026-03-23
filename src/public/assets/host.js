import {
  byId,
  createRtcConfiguration,
  postJson,
  preferredVideoCodecs,
  sendSignal,
  setStatus,
  subscribeToEvents,
} from './common.js';

const hostNameInput = byId('host-name');
const startButton = byId('start-session');
const statusText = byId('host-status');
const sessionCard = byId('session-card');
const viewerLinkInput = byId('viewer-link');
const codecSummary = byId('codec-summary');
const hostPreview = byId('host-preview');
const viewerCount = byId('viewer-count');
const inputLog = byId('input-log');

let sessionId = '';
let hostId = '';
let controlToken = '';
let displayStream = null;
let captureBounds = { width: 0, height: 0 };
const peers = new Map();

function getOrCreatePeerState(viewerId) {
  const existingPeer = peers.get(viewerId);
  if (existingPeer) {
    return existingPeer;
  }

  const peerConnection = new RTCPeerConnection(createRtcConfiguration());
  const inputChannel = peerConnection.createDataChannel('viewer-input');
  const peerState = {
    peerConnection,
    inputChannel,
    pendingIceCandidates: [],
    hasRemoteDescription: false,
  };

  inputChannel.addEventListener('message', (event) => {
    prependInputEntry(`Viewer ${viewerId.slice(0, 8)} sent ${event.data}`);
    void forwardControlToHostMachine(event.data);
  });

  peerConnection.addEventListener('icecandidate', (event) => {
    if (event.candidate) {
      void sendSignal(sessionId, {
        from: hostId,
        to: viewerId,
        type: 'ice-candidate',
        payload: event.candidate,
      });
    }
  });

  peers.set(viewerId, peerState);
  updateViewerCount();
  return peerState;
}

function updateViewerCount() {
  viewerCount.textContent = `${peers.size} viewer${peers.size === 1 ? '' : 's'}`;
}

function prependInputEntry(message) {
  const item = document.createElement('li');
  item.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
  inputLog.prepend(item);

  while (inputLog.childElementCount > 8) {
    inputLog.lastElementChild.remove();
  }
}

function updateCaptureBounds(stream) {
  const [track] = stream.getVideoTracks();
  if (!track) {
    captureBounds = { width: 0, height: 0 };
    return;
  }

  const settings = track.getSettings();
  captureBounds = {
    width: typeof settings.width === 'number' ? settings.width : 0,
    height: typeof settings.height === 'number' ? settings.height : 0,
  };
}

async function forwardControlToHostMachine(rawControl) {
  if (!sessionId || !hostId || !controlToken) {
    return;
  }

  let control;

  try {
    control = JSON.parse(rawControl);
  } catch {
    setStatus(statusText, 'Received malformed viewer control input.');
    return;
  }

  if (!control || typeof control !== 'object') {
    setStatus(statusText, 'Received malformed viewer control input.');
    return;
  }

  const payload = control.payload && typeof control.payload === 'object'
    ? {
        ...control.payload,
        screenWidth: captureBounds.width,
        screenHeight: captureBounds.height,
      }
    : control.payload;

  try {
    await postJson(`/api/sessions/${encodeURIComponent(sessionId)}/controls`, {
      hostId,
      controlToken,
      control: {
        ...control,
        payload,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to apply viewer input on the host machine.';
    setStatus(statusText, message);
  }
}

function describeCodecPreference() {
  const codecs = preferredVideoCodecs();
  if (codecs.length === 0) {
    return 'No AV1/H.264 send codecs were reported by this browser.';
  }

  return `Preferred codecs: ${codecs.map((codec) => codec.mimeType.replace('video/', '')).join(' → ')}. ` +
    'Hardware acceleration is used when the browser and GPU support it.';
}

function attachTracks(peerConnection, stream) {
  const codecs = preferredVideoCodecs();

  for (const track of stream.getVideoTracks()) {
    const transceiver = peerConnection.addTransceiver(track, {
      direction: 'sendonly',
      streams: [stream],
    });

    if (codecs.length > 0) {
      transceiver.setCodecPreferences(codecs);
    }
  }
}

async function handleViewerJoined({ viewerId, viewerName }) {
  setStatus(statusText, `${viewerName} joined. Creating an offer.`);

  const peerState = getOrCreatePeerState(viewerId);
  attachTracks(peerState.peerConnection, displayStream);

  const offer = await peerState.peerConnection.createOffer();
  await peerState.peerConnection.setLocalDescription(offer);

  await sendSignal(sessionId, {
    from: hostId,
    to: viewerId,
    type: 'offer',
    payload: offer,
  });
}

async function handleSignal(message) {
  const peerState = peers.get(message.from);
  if (!peerState) {
    return;
  }

  if (message.type === 'answer') {
    await peerState.peerConnection.setRemoteDescription(message.payload);
    peerState.hasRemoteDescription = true;

    while (peerState.pendingIceCandidates.length > 0) {
      const candidate = peerState.pendingIceCandidates.shift();
      await peerState.peerConnection.addIceCandidate(candidate);
    }

    setStatus(statusText, `Connected to viewer ${message.from.slice(0, 8)}.`);
    return;
  }

  if (message.type === 'ice-candidate' && message.payload) {
    if (!peerState.hasRemoteDescription) {
      peerState.pendingIceCandidates.push(message.payload);
      return;
    }

    await peerState.peerConnection.addIceCandidate(message.payload);
  }
}

async function startSession() {
  startButton.disabled = true;

  try {
    const session = await postJson('/api/sessions', {
      hostName: hostNameInput.value,
    });

    sessionId = session.sessionId;
    hostId = session.hostId;
    controlToken = session.controlToken;

    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: {
          ideal: 60,
          max: 60,
        },
      },
      audio: false,
    });

    updateCaptureBounds(displayStream);
    hostPreview.srcObject = displayStream;
    subscribeToEvents(sessionId, hostId, handleSignal, handleViewerJoined);

    const inviteUrl = new URL('/client', window.location.origin);
    inviteUrl.searchParams.set('sessionId', sessionId);
    viewerLinkInput.value = inviteUrl.toString();
    codecSummary.textContent = describeCodecPreference();
    sessionCard.classList.remove('hidden');
    setStatus(statusText, 'Capture is live. Share the invite link with viewers.');
  } catch (error) {
    setStatus(statusText, error instanceof Error ? error.message : 'Unable to start the session.');
    startButton.disabled = false;
  }
}

startButton.addEventListener('click', () => {
  void startSession();
});
