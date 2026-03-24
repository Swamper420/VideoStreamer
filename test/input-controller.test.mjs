import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLinuxCommands,
  buildYdotoolCommands,
  createInputController,
  normalizeInputAction,
} from '../src/server/input-controller.mjs';

test('normalizeInputAction converts normalized mouse coordinates into host pixels', () => {
  const normalizedControl = normalizeInputAction({
    type: 'mousemove',
    payload: {
      x: 0.5,
      y: 0.25,
      screenWidth: 1920,
      screenHeight: 1080,
    },
  });

  assert.deepEqual(normalizedControl, {
    type: 'mousemove',
    payload: {
      x: 960,
      y: 270,
    },
  });
});

test('normalizeInputAction clamps tiny mouse coordinate drift to the display bounds', () => {
  const normalizedControl = normalizeInputAction({
    type: 'mousemove',
    payload: {
      x: 1.0001,
      y: -0.0004,
      screenWidth: 1920,
      screenHeight: 1080,
    },
  });

  assert.deepEqual(normalizedControl, {
    type: 'mousemove',
    payload: {
      x: 1919,
      y: 0,
    },
  });
});

test('normalizeInputAction accepts string-formatted numeric mouse coordinates', () => {
  const normalizedControl = normalizeInputAction({
    type: 'mousemove',
    payload: {
      x: '0.2864',
      y: '0.4608',
      screenWidth: '1920',
      screenHeight: '1080',
    },
  });

  assert.deepEqual(normalizedControl, {
    type: 'mousemove',
    payload: {
      x: 550,
      y: 497,
    },
  });
});

test('normalizeInputAction still rejects non-finite mouse coordinates', () => {
  assert.throws(
    () =>
      normalizeInputAction({
        type: 'mousemove',
        payload: {
          x: Number.NaN,
          y: 0.25,
          screenWidth: 1920,
          screenHeight: 1080,
        },
      }),
    /x must be a finite number/,
  );
});

test('normalizeInputAction rejects non-numeric string mouse coordinates', () => {
  assert.throws(
    () =>
      normalizeInputAction({
        type: 'mousemove',
        payload: {
          x: 'not-a-number',
          y: 0.25,
          screenWidth: 1920,
          screenHeight: 1080,
        },
      }),
    /x must be a finite number/,
  );
});

test('buildLinuxCommands maps browser click and key controls to xdotool commands', () => {
  const clickCommands = buildLinuxCommands({
    type: 'click',
    payload: {
      button: 2,
    },
  });
  const keyCommands = buildLinuxCommands({
    type: 'keydown',
    payload: {
      code: 'Enter',
      key: 'Enter',
    },
  });

  assert.deepEqual(clickCommands, [
    {
      file: 'xdotool',
      args: ['click', '3'],
    },
  ]);
  assert.deepEqual(keyCommands, [
    {
      file: 'xdotool',
      args: ['key', '--clearmodifiers', 'Return'],
    },
  ]);
});

test('buildYdotoolCommands maps browser click, wheel, and key controls to ydotool commands', () => {
  const clickCommands = buildYdotoolCommands({
    type: 'click',
    payload: {
      button: 2,
    },
  });
  const wheelCommands = buildYdotoolCommands({
    type: 'wheel',
    payload: {
      deltaX: -120,
      deltaY: 240,
    },
  });
  const keyCommands = buildYdotoolCommands({
    type: 'keydown',
    payload: {
      code: 'Enter',
      key: 'Enter',
    },
  });

  assert.deepEqual(clickCommands, [
    {
      file: 'ydotool',
      args: ['click', '0xC1'],
    },
  ]);
  assert.deepEqual(wheelCommands, [
    {
      file: 'ydotool',
      args: ['mousemove', '--wheel', '--', '-1', '-2'],
    },
  ]);
  assert.deepEqual(keyCommands, [
    {
      file: 'ydotool',
      args: ['key', '28:1', '28:0'],
    },
  ]);
});

test('buildYdotoolCommands uses absolute positioning for mouse movement', () => {
  const commands = buildYdotoolCommands({
    type: 'mousemove',
    payload: {
      x: 960,
      y: 540,
    },
  });

  assert.deepEqual(commands, [
    {
      file: 'ydotool',
      args: ['mousemove', '--absolute', '--', '960', '540'],
    },
  ]);
});

test('buildYdotoolCommands maps browser button 0 to ydotool left click', () => {
  const commands = buildYdotoolCommands({
    type: 'click',
    payload: { button: 0 },
  });

  assert.deepEqual(commands, [
    { file: 'ydotool', args: ['click', '0xC0'] },
  ]);
});

test('buildYdotoolCommands maps browser button 1 to ydotool middle click', () => {
  const commands = buildYdotoolCommands({
    type: 'click',
    payload: { button: 1 },
  });

  assert.deepEqual(commands, [
    { file: 'ydotool', args: ['click', '0xC2'] },
  ]);
});

test('buildYdotoolCommands maps keyboard codes to Linux kernel keycodes', () => {
  const escapeCommands = buildYdotoolCommands({
    type: 'keydown',
    payload: { code: 'Escape', key: 'Escape' },
  });
  const letterCommands = buildYdotoolCommands({
    type: 'keydown',
    payload: { code: 'KeyA', key: 'a' },
  });
  const spaceCommands = buildYdotoolCommands({
    type: 'keydown',
    payload: { code: 'Space', key: ' ' },
  });

  assert.deepEqual(escapeCommands, [
    { file: 'ydotool', args: ['key', '1:1', '1:0'] },
  ]);
  assert.deepEqual(letterCommands, [
    { file: 'ydotool', args: ['key', '30:1', '30:0'] },
  ]);
  assert.deepEqual(spaceCommands, [
    { file: 'ydotool', args: ['key', '57:1', '57:0'] },
  ]);
});

test('buildYdotoolCommands falls back to ydotool type for unmapped keys with a single character', () => {
  const commands = buildYdotoolCommands({
    type: 'keydown',
    payload: { code: 'IntlBackslash', key: '|' },
  });

  assert.deepEqual(commands, [
    { file: 'ydotool', args: ['type', '--', '|'] },
  ]);
});

test('createInputController executes validated commands on supported hosts', async () => {
  const executedCommands = [];
  const controller = createInputController({
    platform: 'linux',
    environment: {},
    execFileImpl: async (file, args) => {
      executedCommands.push({ file, args });
    },
  });

  const control = await controller.execute({
    type: 'wheel',
    payload: {
      deltaX: -120,
      deltaY: 240,
    },
  });

  assert.deepEqual(control, {
    type: 'wheel',
    payload: {
      deltaX: -120,
      deltaY: 240,
    },
  });
  assert.deepEqual(executedCommands, [
    {
      file: 'xdotool',
      args: ['click', '--repeat', '1', '6'],
    },
    {
      file: 'xdotool',
      args: ['click', '--repeat', '2', '5'],
    },
  ]);
});

test('createInputController executes validated commands on Wayland hosts using ydotool', async () => {
  const executedCommands = [];
  const controller = createInputController({
    platform: 'linux',
    environment: {
      WAYLAND_DISPLAY: 'wayland-0',
    },
    execFileImpl: async (file, args) => {
      executedCommands.push({ file, args });
    },
  });

  const control = await controller.execute({
    type: 'mousemove',
    payload: {
      x: 0.5,
      y: 0.25,
      screenWidth: 1920,
      screenHeight: 1080,
    },
  });

  assert.deepEqual(control, {
    type: 'mousemove',
    payload: {
      x: 960,
      y: 270,
    },
  });
  assert.deepEqual(executedCommands, [
    {
      file: 'ydotool',
      args: ['mousemove', '--absolute', '--', '960', '270'],
    },
  ]);
});

test('normalizeInputAction rejects already-normalized pixel coordinates that exceed the normalized range', () => {
  const normalized = normalizeInputAction({
    type: 'mousemove',
    payload: { x: 0.5, y: 0.25, screenWidth: 1920, screenHeight: 1080 },
  });

  assert.throws(
    () => normalizeInputAction(normalized),
    /x must be a finite number/,
  );
});

test('createInputController on Wayland succeeds when given raw unnormalized controls', async () => {
  const executedCommands = [];
  const controller = createInputController({
    platform: 'linux',
    environment: { WAYLAND_DISPLAY: 'wayland-0' },
    execFileImpl: async (file, args) => {
      executedCommands.push({ file, args });
    },
  });

  const rawControl = {
    type: 'mousemove',
    payload: { x: 0.5, y: 0.25, screenWidth: 1920, screenHeight: 1080 },
  };

  const result = await controller.execute(rawControl);

  assert.deepEqual(result, {
    type: 'mousemove',
    payload: { x: 960, y: 270 },
  });
  assert.deepEqual(executedCommands, [
    { file: 'ydotool', args: ['mousemove', '--absolute', '--', '960', '270'] },
  ]);
});

test('createInputController reports missing host input tooling clearly', async () => {
  const controller = createInputController({
    platform: 'linux',
    environment: {},
    execFileImpl: async () => {
      const error = new Error('missing');
      error.code = 'ENOENT';
      throw error;
    },
  });

  await assert.rejects(
    () =>
      controller.execute({
        type: 'click',
        payload: {
          button: 0,
        },
      }),
    /requires xdotool/,
  );
});

test('createInputController reports missing Wayland host input tooling clearly', async () => {
  const controller = createInputController({
    platform: 'linux',
    environment: {
      XDG_SESSION_TYPE: 'wayland',
    },
    execFileImpl: async () => {
      const error = new Error('missing');
      error.code = 'ENOENT';
      throw error;
    },
  });

  await assert.rejects(
    () =>
      controller.execute({
        type: 'click',
        payload: {
          button: 0,
        },
      }),
    /requires ydotool and a running ydotoold daemon/,
  );
});

test('createInputController includes stderr details when a tool command fails', async () => {
  const controller = createInputController({
    platform: 'linux',
    environment: {
      XDG_SESSION_TYPE: 'wayland',
    },
    execFileImpl: async () => {
      const error = new Error('Command failed');
      error.stderr = 'ydotool: error: failed to connect to ydotoold socket';
      throw error;
    },
  });

  await assert.rejects(
    () =>
      controller.execute({
        type: 'click',
        payload: {
          button: 0,
        },
      }),
    (error) => {
      assert.match(error.message, /Unable to apply input on the host machine\./);
      assert.match(error.message, /ydotool: error: failed to connect to ydotoold socket/);
      return true;
    },
  );
});

test('createInputController includes error message when tool fails without stderr', async () => {
  const controller = createInputController({
    platform: 'linux',
    environment: {},
    execFileImpl: async () => {
      throw new Error('Command failed: xdotool');
    },
  });

  await assert.rejects(
    () =>
      controller.execute({
        type: 'click',
        payload: {
          button: 0,
        },
      }),
    (error) => {
      assert.match(error.message, /Unable to apply input on the host machine\./);
      assert.match(error.message, /Command failed: xdotool/);
      return true;
    },
  );
});
