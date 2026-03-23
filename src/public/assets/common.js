export function byId(id) {
  return document.getElementById(id);
}

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

export function preferredVideoCodecs() {
  const capabilities = RTCRtpSender.getCapabilities?.('video');
  if (!capabilities?.codecs) {
    return [];
  }

  return capabilities.codecs.filter((codec) => codec.mimeType === 'video/AV1' || codec.mimeType === 'video/H264');
}
