function escapeShellValue(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function shouldPreferLinuxInputBridge({ platform = '', hostname = '' } = {}) {
  const normalizedPlatform = String(platform).toLowerCase();
  const normalizedHostname = String(hostname).toLowerCase();
  const isLinuxHost = normalizedPlatform.includes('linux');
  const isLocalOrigin = normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '::1' ||
    normalizedHostname === '[::1]';

  return isLinuxHost && !isLocalOrigin;
}

export function buildLinuxInputBridgeCommand({ serverOrigin, sessionId, hostId, controlToken }) {
  return [
    `VIDEO_STREAMER_SERVER_URL=${escapeShellValue(serverOrigin)}`,
    `VIDEO_STREAMER_SESSION_ID=${escapeShellValue(sessionId)}`,
    `VIDEO_STREAMER_HOST_ID=${escapeShellValue(hostId)}`,
    `VIDEO_STREAMER_CONTROL_TOKEN=${escapeShellValue(controlToken)}`,
    'npm run input-bridge',
  ].join(' ');
}
