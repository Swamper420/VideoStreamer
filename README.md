# VideoStreamer

VideoStreamer is a minimal browser-based remote streaming system designed for easy deployment on Linux and Windows.
It uses WebRTC for low-latency delivery to multiple viewers, forwards viewer input to the host over data channels,
and prefers AV1 with H.264 fallback when the browser exposes those codecs.

## Features

- Low-latency WebRTC screen and audio streaming from one host to multiple viewers
- Viewer mouse, wheel, click, and keyboard input forwarded back to the host
- AV1-first codec preference with H.264 fallback
- Browser/OS hardware acceleration on supported GPUs for both encoding and decoding
- Simple deployment with either Node.js or Docker
- Public STUN discovery enabled by default for viewers connecting from outside the local network

## Quick start

### Node.js

```bash
npm start
```

Open `http://localhost:3000/host` on the host machine, create a session, allow screen/audio capture, and share the
generated client link with viewers.

Host input control is executed by the Node.js process running on the host machine. Linux hosts need `xdotool`
installed, and Windows hosts use PowerShell. Running the app directly on the host OS is recommended when you need
remote control support.

#### Getting host input working

- Start the server on the same machine that should receive remote mouse and keyboard input.
- Linux hosts need `xdotool` installed before starting `npm start`. On Debian or Ubuntu:

  ```bash
  sudo apt update
  sudo apt install xdotool
  ```

- Windows hosts use the built-in PowerShell executable. If `powershell.exe` is unavailable in `PATH`, install or
  re-enable Windows PowerShell before starting the server.
- When running inside Docker, input forwarding still has to be executed by a process on the host OS. Use the Node.js
  setup above when you want viewers to control the host machine.

### Docker

```bash
docker compose up --build
```

## Notes on codecs and acceleration

- VideoStreamer relies on the browser WebRTC stack, so AV1/H.264 availability depends on the browser, OS, and GPU.
- Hardware acceleration must be enabled in the browser for GPU-backed encode/decode.
- Chromium-based browsers generally provide the broadest H.264 support and the best chance of AV1 hardware support
  on newer GPUs.

## Testing

```bash
npm test
```
