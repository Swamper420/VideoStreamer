import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../src/server/session-store.mjs';

function createFakeResponse() {
  const writes = [];

  return {
    writes,
    write(chunk) {
      writes.push(chunk);
    },
  };
}

test('createSessionStore queues join messages for a disconnected host', () => {
  const store = createSessionStore();
  const session = store.createSession({ hostName: 'Main host' });

  const viewer = store.addViewer(session.sessionId, { viewerName: 'Remote viewer' });
  assert.match(viewer.participantId, /^[0-9a-f-]{36}$/);

  const response = createFakeResponse();
  store.attachEventStream(session.sessionId, session.hostId, response);

  assert.equal(response.writes[0], 'retry: 1000\n\n');
  assert.match(response.writes[1], /event: viewer-joined/);
  assert.match(response.writes[1], /Remote viewer/);
});

test('createSessionStore routes signal messages to the target participant', () => {
  const store = createSessionStore();
  const session = store.createSession({ hostName: 'Host' });
  const viewer = store.addViewer(session.sessionId, { viewerName: 'Viewer' });
  const response = createFakeResponse();

  store.attachEventStream(session.sessionId, viewer.participantId, response);
  const routedMessage = store.routeMessage(session.sessionId, {
    from: session.hostId,
    to: viewer.participantId,
    type: 'offer',
    payload: { sdp: 'test-offer' },
  });

  assert.equal(routedMessage.type, 'offer');
  assert.match(response.writes[1], /event: signal/);
  assert.match(response.writes[1], /test-offer/);
});

test('createSessionStore trims participant names to a safe size', () => {
  const store = createSessionStore();
  const session = store.createSession({ hostName: 'H'.repeat(120) });
  const summary = store.getSessionSummary(session.sessionId);

  assert.equal(summary.participantCount, 1);
  assert.equal(session.hostName.length, 80);
});

test('createSessionStore authorizes host control only with the issued control token', () => {
  const store = createSessionStore();
  const session = store.createSession({ hostName: 'Host' });

  assert.doesNotThrow(() => {
    store.authorizeHostControl(session.sessionId, {
      hostId: session.hostId,
      controlToken: session.controlToken,
    });
  });

  assert.throws(
    () =>
      store.authorizeHostControl(session.sessionId, {
        hostId: session.hostId,
        controlToken: 'bad-token',
      }),
    /Host control authorization failed/,
  );
});

test('createSessionStore rejects malformed signal messages', () => {
  const store = createSessionStore();
  const session = store.createSession({ hostName: 'Host' });
  const viewer = store.addViewer(session.sessionId, { viewerName: 'Viewer' });

  assert.throws(
    () =>
      store.routeMessage(session.sessionId, {
        from: session.hostId,
        to: viewer.participantId,
        type: '',
      }),
    /Message type must be between 1 and 64 characters/,
  );
});

test('createSessionStore queues control events for a disconnected bridge host', () => {
  const store = createSessionStore();
  const session = store.createSession({ hostName: 'Host', controlMode: 'bridge' });

  store.queueHostControl(session.sessionId, {
    type: 'click',
    payload: {
      button: 0,
    },
  });

  const response = createFakeResponse();
  store.attachHostControlStream(session.sessionId, {
    hostId: session.hostId,
    controlToken: session.controlToken,
  }, response);

  assert.equal(response.writes[0], 'retry: 1000\n\n');
  assert.match(response.writes[1], /event: control/);
  assert.match(response.writes[1], /"button":0/);
});

test('createSessionStore rejects control bridge connections with a bad token', () => {
  const store = createSessionStore();
  const session = store.createSession({ hostName: 'Host', controlMode: 'bridge' });
  const response = createFakeResponse();

  assert.throws(
    () => store.attachHostControlStream(session.sessionId, {
      hostId: session.hostId,
      controlToken: 'bad-token',
    }, response),
    /Host control authorization failed/,
  );
});
