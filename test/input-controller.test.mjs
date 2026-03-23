import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLinuxCommands,
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

test('createInputController executes validated commands on supported hosts', async () => {
  const executedCommands = [];
  const controller = createInputController({
    platform: 'linux',
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

test('createInputController reports missing host input tooling clearly', async () => {
  const controller = createInputController({
    platform: 'linux',
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
