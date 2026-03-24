import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLinuxCommands,
  buildWaylandCommands,
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

test('buildWaylandCommands maps browser click, wheel, and key controls to Wayland tools', () => {
  const clickCommands = buildWaylandCommands({
    type: 'click',
    payload: {
      button: 2,
    },
  });
  const wheelCommands = buildWaylandCommands({
    type: 'wheel',
    payload: {
      deltaX: -120,
      deltaY: 240,
    },
  });
  const keyCommands = buildWaylandCommands({
    type: 'keydown',
    payload: {
      code: 'Enter',
      key: 'Enter',
    },
  });

  assert.deepEqual(clickCommands, [
    {
      file: 'ydotool',
      args: ['click', '3'],
    },
  ]);
  assert.deepEqual(wheelCommands, [
    {
      file: 'wlrctl',
      args: ['pointer', 'scroll', '2', '-1'],
    },
  ]);
  assert.deepEqual(keyCommands, [
    {
      file: 'wtype',
      args: ['-P', 'return', '-p', 'return'],
    },
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

test('createInputController executes validated commands on Wayland hosts', async () => {
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
      args: ['mousemove', '960', '270'],
    },
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
    /requires ydotool, wtype, and wlrctl/,
  );
});
