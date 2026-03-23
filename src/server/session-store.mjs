import { randomUUID, timingSafeEqual } from 'node:crypto';

const MAX_MESSAGE_QUEUE = 64;

function createParticipant(role, name) {
  return {
    id: randomUUID(),
    role,
    name,
    response: null,
    queuedMessages: [],
  };
}

function sanitizeName(name, fallback) {
  if (typeof name !== 'string') {
    return fallback;
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.slice(0, 80);
}

function sanitizeMessage(message) {
  if (!message || typeof message !== 'object') {
    throw new Error('Message payload is required.');
  }

  const { from, to, type } = message;
  if (typeof from !== 'string' || typeof to !== 'string' || typeof type !== 'string') {
    throw new Error('Message routing requires string from, to, and type fields.');
  }

  const normalizedType = type.trim();
  if (!normalizedType || normalizedType.length > 64) {
    throw new Error('Message type must be between 1 and 64 characters.');
  }

  return {
    from,
    to,
    type: normalizedType,
    payload: message.payload ?? null,
  };
}

export function createSessionStore() {
  const sessions = new Map();

  function tokensMatch(expectedToken, actualToken) {
    if (typeof expectedToken !== 'string' || typeof actualToken !== 'string') {
      return false;
    }

    const expectedBuffer = Buffer.from(expectedToken);
    const actualBuffer = Buffer.from(actualToken);
    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, actualBuffer);
  }

  function getSessionOrThrow(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found.');
    }

    return session;
  }

  function getParticipantOrThrow(session, participantId) {
    const participant = session.participants.get(participantId);
    if (!participant) {
      throw new Error('Participant not found.');
    }

    return participant;
  }

  function queueMessage(participant, message) {
    participant.queuedMessages.push(message);
    if (participant.queuedMessages.length > MAX_MESSAGE_QUEUE) {
      participant.queuedMessages.shift();
    }
  }

  function sendEvent(participant, event, data) {
    const message = { event, data };

    if (!participant.response) {
      queueMessage(participant, message);
      return;
    }

    participant.response.write(`event: ${event}\n`);
    participant.response.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  return {
    createSession({ hostName = 'Host' } = {}) {
      const sessionId = randomUUID();
      const host = createParticipant('host', sanitizeName(hostName, 'Host'));
      const session = {
        id: sessionId,
        createdAt: new Date().toISOString(),
        hostId: host.id,
        controlToken: randomUUID(),
        participants: new Map([[host.id, host]]),
      };

      sessions.set(sessionId, session);
      return {
        sessionId,
        hostId: host.id,
        hostName: host.name,
        controlToken: session.controlToken,
      };
    },

    getSessionSummary(sessionId) {
      const session = getSessionOrThrow(sessionId);
      return {
        sessionId: session.id,
        hostId: session.hostId,
        participantCount: session.participants.size,
      };
    },

    addViewer(sessionId, { viewerName = 'Viewer' } = {}) {
      const session = getSessionOrThrow(sessionId);
      const viewer = createParticipant('viewer', sanitizeName(viewerName, 'Viewer'));
      session.participants.set(viewer.id, viewer);

      sendEvent(session.participants.get(session.hostId), 'viewer-joined', {
        viewerId: viewer.id,
        viewerName: viewer.name,
      });

      return {
        sessionId,
        participantId: viewer.id,
        viewerName: viewer.name,
      };
    },

    attachEventStream(sessionId, participantId, response) {
      const session = getSessionOrThrow(sessionId);
      const participant = getParticipantOrThrow(session, participantId);
      participant.response = response;
      response.write('retry: 1000\n\n');

      for (const message of participant.queuedMessages) {
        response.write(`event: ${message.event}\n`);
        response.write(`data: ${JSON.stringify(message.data)}\n\n`);
      }

      participant.queuedMessages = [];

      return () => {
        if (participant.response === response) {
          participant.response = null;
        }
      };
    },

    routeMessage(sessionId, message) {
      const session = getSessionOrThrow(sessionId);
      const sanitizedMessage = sanitizeMessage(message);
      const sender = getParticipantOrThrow(session, sanitizedMessage.from);
      const recipient = getParticipantOrThrow(session, sanitizedMessage.to);

      const routedMessage = {
        from: sender.id,
        to: recipient.id,
        type: sanitizedMessage.type,
        payload: sanitizedMessage.payload,
      };

      sendEvent(recipient, 'signal', routedMessage);
      return routedMessage;
    },

    authorizeHostControl(sessionId, { hostId, controlToken } = {}) {
      const session = getSessionOrThrow(sessionId);
      if (session.hostId !== hostId || !tokensMatch(session.controlToken, controlToken)) {
        throw new Error('Host control authorization failed.');
      }

      return {
        sessionId: session.id,
        hostId: session.hostId,
      };
    },
  };
}
