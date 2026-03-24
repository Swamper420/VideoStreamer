import { createInputController } from './server/input-controller.mjs';

const REQUIRED_ENVIRONMENT_VARIABLES = [
  'VIDEO_STREAMER_SERVER_URL',
  'VIDEO_STREAMER_SESSION_ID',
  'VIDEO_STREAMER_HOST_ID',
  'VIDEO_STREAMER_CONTROL_TOKEN',
];

function readRequiredEnvironmentVariable(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
}

function validateEnvironment() {
  const missingVariables = REQUIRED_ENVIRONMENT_VARIABLES.filter((name) => !process.env[name]);
  if (missingVariables.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVariables.join(', ')}.`);
  }
}

function createControlStreamUrl() {
  const serverUrl = new URL(readRequiredEnvironmentVariable('VIDEO_STREAMER_SERVER_URL'));
  const sessionId = readRequiredEnvironmentVariable('VIDEO_STREAMER_SESSION_ID');
  const hostId = readRequiredEnvironmentVariable('VIDEO_STREAMER_HOST_ID');
  const controlToken = readRequiredEnvironmentVariable('VIDEO_STREAMER_CONTROL_TOKEN');

  serverUrl.pathname = `/api/sessions/${encodeURIComponent(sessionId)}/controls/stream`;
  serverUrl.searchParams.set('hostId', hostId);
  serverUrl.searchParams.set('controlToken', controlToken);
  return serverUrl;
}

async function streamControls(streamUrl, onControl) {
  const response = await fetch(streamUrl, {
    headers: {
      Accept: 'text/event-stream',
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Unable to connect to ${streamUrl.origin}: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  let eventData = '';

  async function flushEvent() {
    if (eventName === 'control' && eventData) {
      await onControl(JSON.parse(eventData));
    }

    eventName = 'message';
    eventData = '';
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line) {
        await flushEvent();
        continue;
      }

      if (line.startsWith(':')) {
        continue;
      }

      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        const dataFragment = line.slice('data:'.length).trimStart();
        eventData = eventData ? `${eventData}\n${dataFragment}` : dataFragment;
      }
    }
  }

  await flushEvent();
}

async function startInputBridge() {
  validateEnvironment();

  const controlStreamUrl = createControlStreamUrl();
  const inputController = createInputController();
  console.log(`VideoStreamer input bridge listening for controls from ${controlStreamUrl.origin}.`);

  while (true) {
    try {
      await streamControls(controlStreamUrl, async (control) => {
        try {
          await inputController.execute(control);
        } catch (controlError) {
          console.error(controlError instanceof Error ? controlError.message : 'Unable to apply input on the host machine.');
        }
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Input bridge disconnected unexpectedly.');
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

startInputBridge().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unable to start the VideoStreamer input bridge.';
  console.error(message);
  process.exitCode = 1;
});
