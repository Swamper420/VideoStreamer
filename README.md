# VideoStreamer

VideoStreamer is a minimal browser-based remote streaming system designed for easy deployment on Linux and Windows.
It uses WebRTC for low-latency delivery to multiple viewers, forwards viewer input to the host over data channels,
and prefers AV1 with H.264 fallback when the browser exposes those codecs.

## Features

- Low-latency WebRTC screen streaming (with audio when supported) from one host to multiple viewers
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

Host input control is executed by the Node.js process running on the host machine. Linux hosts use `xdotool` on X11
sessions and `ydotool` on Wayland sessions (works with any compositor including KDE Plasma, GNOME, and Sway).
Windows hosts use PowerShell. Running the app directly on the host OS is recommended when you need remote control
support.

#### Getting host input working

- Start the server on the same machine that should receive remote mouse and keyboard input.
- Linux X11 hosts need `xdotool` installed before starting `npm start`. On Debian or Ubuntu:

  ```bash
  sudo apt update
  sudo apt install xdotool
  ```

- Linux Wayland hosts need `ydotool` installed and its companion `ydotoold` daemon running before starting `npm start`
  or `npm run input-bridge`. `ydotool` works at the kernel level via `/dev/uinput` and is compatible with all Wayland
  compositors (KDE Plasma, GNOME, Sway, Hyprland, and others).

  ```bash
  sudo apt update
  sudo apt install ydotool
  sudo nohup ydotoold >/tmp/ydotoold.log 2>&1 &
  ```

  Keep `ydotoold` running while the host session is active. If your distro provides a service unit for `ydotoold`,
  enabling that service is a good alternative to starting it manually.

- Windows hosts use the built-in PowerShell executable. If `powershell.exe` is unavailable in `PATH`, install or
  re-enable Windows PowerShell before starting the server.
- When the video service is running remotely, or inside Docker on another machine, enable the **local Linux input
  bridge** checkbox on the host page. After the session starts, copy the generated command and run it on the Linux
  machine that should receive mouse and keyboard input:

  ```bash
  sudo apt update
  sudo apt install ydotool
  sudo nohup ydotoold >/tmp/ydotoold.log 2>&1 &
  VIDEO_STREAMER_SERVER_URL='https://your-server.example.com' \
  VIDEO_STREAMER_SESSION_ID='...' \
  VIDEO_STREAMER_HOST_ID='...' \
  VIDEO_STREAMER_CONTROL_TOKEN='...' \
  npm run input-bridge
  ```

  Copy the exact command from the host page so the session ID, host ID, and control token match the active session.
  On Wayland desktops, install `ydotool` and start `ydotoold` before running the bridge. On X11 desktops, install
  `xdotool` instead—the bridge detects the session type automatically.

  The bridge opens an outbound event stream back to the VideoStreamer server, so the server does not need direct
  network access to the Linux host.

### Docker

```bash
docker compose up --build
```

Docker remains a good way to run the streaming service itself. For Linux host input, run the generated `npm run
input-bridge` command on the actual Linux desktop that should receive the forwarded controls.

## Notes on codecs and acceleration

- VideoStreamer relies on the browser WebRTC stack, so AV1/H.264 availability depends on the browser, OS, and GPU.
- Hardware acceleration must be enabled in the browser for GPU-backed encode/decode.
- Chromium-based browsers generally provide the broadest H.264 support and the best chance of AV1 hardware support
  on newer GPUs.

## Testing

```bash
npm test
```
