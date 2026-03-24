import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_DISPLAY_DIMENSION = 16_384;
const MAX_SCROLL_STEPS = 12;
const MAX_KEY_IDENTIFIER_LENGTH = 64;
const NORMALIZED_COORDINATE_TOLERANCE = 0.001;
const WINDOWS_SEND_KEYS_SPECIAL_CHARACTERS = '+^%~(){}';
const XDOTOOL_SCROLL_LEFT_BUTTON = '6';
const XDOTOOL_SCROLL_RIGHT_BUTTON = '7';
const XDOTOOL_SCROLL_UP_BUTTON = '4';
const XDOTOOL_SCROLL_DOWN_BUTTON = '5';
const WINDOWS_MOUSE_EVENT_WHEEL = 0x0800;
const WINDOWS_MOUSE_EVENT_HWHEEL = 0x1000;
const WINDOWS_MOUSE_EVENT_FLAGS = new Map([
  [0, { down: 0x0002, up: 0x0004 }],
  [1, { down: 0x0020, up: 0x0040 }],
  [2, { down: 0x0008, up: 0x0010 }],
]);

const specialLinuxKeys = new Map([
  ['ArrowDown', 'Down'],
  ['ArrowLeft', 'Left'],
  ['ArrowRight', 'Right'],
  ['ArrowUp', 'Up'],
  ['Backspace', 'BackSpace'],
  ['Delete', 'Delete'],
  ['End', 'End'],
  ['Enter', 'Return'],
  ['Escape', 'Escape'],
  ['Home', 'Home'],
  ['PageDown', 'Next'],
  ['PageUp', 'Prior'],
  ['Space', 'space'],
  ['Tab', 'Tab'],
]);

const jsCodeToLinuxKeycode = new Map([
  ['Escape', 1],
  ['F1', 59], ['F2', 60], ['F3', 61], ['F4', 62],
  ['F5', 63], ['F6', 64], ['F7', 65], ['F8', 66],
  ['F9', 67], ['F10', 68], ['F11', 87], ['F12', 88],
  ['Backquote', 41],
  ['Digit1', 2], ['Digit2', 3], ['Digit3', 4], ['Digit4', 5],
  ['Digit5', 6], ['Digit6', 7], ['Digit7', 8], ['Digit8', 9],
  ['Digit9', 10], ['Digit0', 11],
  ['Minus', 12], ['Equal', 13], ['Backspace', 14],
  ['Tab', 15],
  ['KeyQ', 16], ['KeyW', 17], ['KeyE', 18], ['KeyR', 19], ['KeyT', 20],
  ['KeyY', 21], ['KeyU', 22], ['KeyI', 23], ['KeyO', 24], ['KeyP', 25],
  ['BracketLeft', 26], ['BracketRight', 27], ['Backslash', 43],
  ['CapsLock', 58],
  ['KeyA', 30], ['KeyS', 31], ['KeyD', 32], ['KeyF', 33], ['KeyG', 34],
  ['KeyH', 35], ['KeyJ', 36], ['KeyK', 37], ['KeyL', 38],
  ['Semicolon', 39], ['Quote', 40], ['Enter', 28],
  ['ShiftLeft', 42],
  ['KeyZ', 44], ['KeyX', 45], ['KeyC', 46], ['KeyV', 47], ['KeyB', 48],
  ['KeyN', 49], ['KeyM', 50],
  ['Comma', 51], ['Period', 52], ['Slash', 53],
  ['ShiftRight', 54],
  ['ControlLeft', 29], ['MetaLeft', 125], ['AltLeft', 56],
  ['Space', 57],
  ['AltRight', 100], ['MetaRight', 126], ['ContextMenu', 127], ['ControlRight', 97],
  ['Insert', 110], ['Delete', 111],
  ['Home', 102], ['End', 107],
  ['PageUp', 104], ['PageDown', 109],
  ['ArrowUp', 103], ['ArrowDown', 108], ['ArrowLeft', 105], ['ArrowRight', 106],
  ['NumLock', 69],
  ['NumpadDivide', 98], ['NumpadMultiply', 55], ['NumpadSubtract', 74],
  ['NumpadAdd', 78], ['NumpadEnter', 96], ['NumpadDecimal', 83],
  ['Numpad0', 82], ['Numpad1', 79], ['Numpad2', 80], ['Numpad3', 81],
  ['Numpad4', 75], ['Numpad5', 76], ['Numpad6', 77],
  ['Numpad7', 71], ['Numpad8', 72], ['Numpad9', 73],
  ['ScrollLock', 70], ['Pause', 119], ['PrintScreen', 99],
]);

const YDOTOOL_CLICK_CODES = new Map([
  [0, '0xC0'],
  [1, '0xC2'],
  [2, '0xC1'],
]);

const specialWindowsKeys = new Map([
  ['ArrowDown', '{DOWN}'],
  ['ArrowLeft', '{LEFT}'],
  ['ArrowRight', '{RIGHT}'],
  ['ArrowUp', '{UP}'],
  ['Backspace', '{BACKSPACE}'],
  ['Delete', '{DELETE}'],
  ['End', '{END}'],
  ['Enter', '{ENTER}'],
  ['Escape', '{ESC}'],
  ['Home', '{HOME}'],
  ['PageDown', '{PGDN}'],
  ['PageUp', '{PGUP}'],
  ['Space', ' '],
  ['Tab', '{TAB}'],
]);

function toFiniteNumber(value, field, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  const numericValue = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof numericValue !== 'number' || !Number.isFinite(numericValue) || numericValue < min || numericValue > max) {
    throw new Error(`${field} must be a finite number between ${min} and ${max}.`);
  }

  return numericValue;
}

function toPositiveInteger(value, field) {
  const numericValue = toFiniteNumber(value, field, { min: 1, max: MAX_DISPLAY_DIMENSION });
  if (!Number.isInteger(numericValue)) {
    throw new Error(`${field} must be a positive integer.`);
  }

  return numericValue;
}

function sanitizeKeyValue(value, field) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (trimmed.length > MAX_KEY_IDENTIFIER_LENGTH) {
    throw new Error(`${field} must be ${MAX_KEY_IDENTIFIER_LENGTH} characters or fewer.`);
  }

  return trimmed;
}

function clampNormalizedCoordinate(value, field) {
  const numericValue = toFiniteNumber(
    value,
    field,
    {
      min: 0 - NORMALIZED_COORDINATE_TOLERANCE,
      max: 1 + NORMALIZED_COORDINATE_TOLERANCE,
    },
  );

  return Math.min(1, Math.max(0, numericValue));
}

function scaleCoordinate(value, size) {
  if (size <= 1) {
    return 0;
  }

  return Math.round(value * (size - 1));
}

function normalizeScrollSteps(delta) {
  if (!Number.isFinite(delta) || delta === 0) {
    return 0;
  }

  return Math.max(1, Math.min(MAX_SCROLL_STEPS, Math.round(Math.abs(delta) / 120) || 1));
}

function mapLinuxKey({ code, key }) {
  if (specialLinuxKeys.has(code)) {
    return specialLinuxKeys.get(code);
  }

  if (key.length === 1) {
    return key === ' ' ? 'space' : key;
  }

  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(-1).toLowerCase();
  }

  if (/^Digit\d$/.test(code)) {
    return code.slice(-1);
  }

  return '';
}

function mapYdotoolKey({ code, key }) {
  const keycode = jsCodeToLinuxKeycode.get(code);
  if (keycode !== undefined) {
    return { type: 'keycode', value: keycode };
  }

  if (key.length === 1) {
    return { type: 'text', value: key };
  }

  return null;
}

function escapeWindowsCharacter(character) {
  if (WINDOWS_SEND_KEYS_SPECIAL_CHARACTERS.includes(character)) {
    return `{${character}}`;
  }

  if (character === '[') {
    return '{[}';
  }

  if (character === ']') {
    return '{]}';
  }

  if (character === '\'') {
    return escapePowerShellSingleQuotedCharacter(character);
  }

  return character;
}

function escapePowerShellSingleQuotedCharacter(character) {
  if (character !== '\'') {
    throw new Error('PowerShell single-quote escaping only supports single quote characters.');
  }

  return character.repeat(2);
}

function mapWindowsKey({ code, key }) {
  if (specialWindowsKeys.has(code)) {
    return specialWindowsKeys.get(code);
  }

  if (key.length === 1) {
    return escapeWindowsCharacter(key);
  }

  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(-1);
  }

  if (/^Digit\d$/.test(code)) {
    return code.slice(-1);
  }

  return '';
}

export function normalizeInputAction(control) {
  if (!control || typeof control !== 'object') {
    throw new Error('Control input is required.');
  }

  const { type, payload } = control;
  if (typeof type !== 'string') {
    throw new Error('Control type is required.');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Control payload is required.');
  }

  if (type === 'mousemove') {
    const x = clampNormalizedCoordinate(payload.x, 'x');
    const y = clampNormalizedCoordinate(payload.y, 'y');
    const screenWidth = toPositiveInteger(payload.screenWidth, 'screenWidth');
    const screenHeight = toPositiveInteger(payload.screenHeight, 'screenHeight');
    return {
      type,
      payload: {
        x: scaleCoordinate(x, screenWidth),
        y: scaleCoordinate(y, screenHeight),
      },
    };
  }

  if (type === 'click') {
    const button = toFiniteNumber(payload.button, 'button', { min: 0, max: 2 });
    if (!Number.isInteger(button)) {
      throw new Error('button must be an integer.');
    }

    return {
      type,
      payload: { button },
    };
  }

  if (type === 'wheel') {
    return {
      type,
      payload: {
        deltaX: toFiniteNumber(payload.deltaX, 'deltaX'),
        deltaY: toFiniteNumber(payload.deltaY, 'deltaY'),
      },
    };
  }

  if (type === 'keydown') {
    const code = sanitizeKeyValue(payload.code, 'code');
    const key = sanitizeKeyValue(payload.key, 'key');
    if (!code && !key) {
      throw new Error('A keyboard control requires a code or key value.');
    }

    return {
      type,
      payload: { code, key },
    };
  }

  throw new Error('Unsupported control type.');
}

export function buildLinuxCommands(control) {
  if (control.type === 'mousemove') {
    return [
      {
        file: 'xdotool',
        args: ['mousemove', '--sync', String(control.payload.x), String(control.payload.y)],
      },
    ];
  }

  if (control.type === 'click') {
    return [
      {
        file: 'xdotool',
        args: ['click', String(control.payload.button + 1)],
      },
    ];
  }

  if (control.type === 'wheel') {
    const commands = [];
    const horizontalSteps = normalizeScrollSteps(control.payload.deltaX);
    const verticalSteps = normalizeScrollSteps(control.payload.deltaY);

    if (horizontalSteps > 0) {
      commands.push({
        file: 'xdotool',
        args: [
          'click',
          '--repeat',
          String(horizontalSteps),
          control.payload.deltaX > 0 ? XDOTOOL_SCROLL_RIGHT_BUTTON : XDOTOOL_SCROLL_LEFT_BUTTON,
        ],
      });
    }

    if (verticalSteps > 0) {
      commands.push({
        file: 'xdotool',
        args: [
          'click',
          '--repeat',
          String(verticalSteps),
          control.payload.deltaY > 0 ? XDOTOOL_SCROLL_DOWN_BUTTON : XDOTOOL_SCROLL_UP_BUTTON,
        ],
      });
    }

    return commands;
  }

  if (control.type === 'keydown') {
    const key = mapLinuxKey(control.payload);
    if (!key) {
      return [];
    }

    return [
      {
        file: 'xdotool',
        args: ['key', '--clearmodifiers', key],
      },
    ];
  }

  return [];
}

export function buildYdotoolCommands(control) {
  if (control.type === 'mousemove') {
    return [
      {
        file: 'ydotool',
        args: ['mousemove', '--absolute', '--', String(control.payload.x), String(control.payload.y)],
      },
    ];
  }

  if (control.type === 'click') {
    const clickCode = YDOTOOL_CLICK_CODES.get(control.payload.button);
    if (!clickCode) {
      return [];
    }

    return [
      {
        file: 'ydotool',
        args: ['click', clickCode],
      },
    ];
  }

  if (control.type === 'wheel') {
    const horizontalSteps = normalizeScrollSteps(control.payload.deltaX);
    const verticalSteps = normalizeScrollSteps(control.payload.deltaY);
    if (horizontalSteps === 0 && verticalSteps === 0) {
      return [];
    }

    const hwheel = horizontalSteps === 0
      ? 0
      : control.payload.deltaX > 0 ? horizontalSteps : -horizontalSteps;
    const wheel = verticalSteps === 0
      ? 0
      : control.payload.deltaY > 0 ? -verticalSteps : verticalSteps;

    return [
      {
        file: 'ydotool',
        args: ['mousemove', '--wheel', '--', String(hwheel), String(wheel)],
      },
    ];
  }

  if (control.type === 'keydown') {
    const key = mapYdotoolKey(control.payload);
    if (!key) {
      return [];
    }

    if (key.type === 'keycode') {
      return [
        {
          file: 'ydotool',
          args: ['key', `${key.value}:1`, `${key.value}:0`],
        },
      ];
    }

    return [
      {
        file: 'ydotool',
        args: ['type', '--', key.value],
      },
    ];
  }

  return [];
}

function detectLinuxInputBackend(environment) {
  const sessionType = typeof environment?.XDG_SESSION_TYPE === 'string'
    ? environment.XDG_SESSION_TYPE.trim().toLowerCase()
    : '';
  const hasWaylandDisplay = typeof environment?.WAYLAND_DISPLAY === 'string' && environment.WAYLAND_DISPLAY.trim() !== '';
  if (sessionType === 'wayland' || hasWaylandDisplay) {
    return 'wayland';
  }

  return 'x11';
}

function createWindowsMouseScript(flags, extraData = 0) {
  return [
    'Add-Type @"',
    'using System.Runtime.InteropServices;',
    'public static class NativeInput {',
    '  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);',
    '  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, nuint dwExtraInfo);',
    '}',
    '"@;',
    `[NativeInput]::mouse_event(${flags}, 0, 0, ${extraData}, [nuint]::Zero);`,
  ].join(' ');
}

function createWindowsSetCursorScript(x, y) {
  return [
    'Add-Type @"',
    'using System.Runtime.InteropServices;',
    'public static class NativeInput {',
    '  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);',
    '}',
    '"@;',
    `[NativeInput]::SetCursorPos(${x}, ${y}) | Out-Null;`,
  ].join(' ');
}

export function buildWindowsCommands(control) {
  if (control.type === 'mousemove') {
    return [
      {
        file: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-Command', createWindowsSetCursorScript(control.payload.x, control.payload.y)],
      },
    ];
  }

  if (control.type === 'click') {
    const flags = WINDOWS_MOUSE_EVENT_FLAGS.get(control.payload.button);
    return [
      {
        file: 'powershell.exe',
        args: [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `${createWindowsMouseScript(flags.down)} ${createWindowsMouseScript(flags.up)}`,
        ],
      },
    ];
  }

  if (control.type === 'wheel') {
    const commands = [];
    const horizontalSteps = normalizeScrollSteps(control.payload.deltaX);
    const verticalSteps = normalizeScrollSteps(control.payload.deltaY);

    if (horizontalSteps > 0) {
      commands.push({
        file: 'powershell.exe',
        args: [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          createWindowsMouseScript(
            WINDOWS_MOUSE_EVENT_HWHEEL,
            (control.payload.deltaX > 0 ? 1 : -1) * horizontalSteps * 120,
          ),
        ],
      });
    }

    if (verticalSteps > 0) {
      commands.push({
        file: 'powershell.exe',
        args: [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          createWindowsMouseScript(
            WINDOWS_MOUSE_EVENT_WHEEL,
            (control.payload.deltaY > 0 ? -1 : 1) * verticalSteps * 120,
          ),
        ],
      });
    }

    return commands;
  }

  if (control.type === 'keydown') {
    const key = mapWindowsKey(control.payload);
    if (!key) {
      return [];
    }

    return [
      {
        file: 'powershell.exe',
        args: [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${key}');`,
        ],
      },
    ];
  }

  return [];
}

export function createInputController({
  platform = process.platform,
  environment = process.env,
  execFileImpl = execFileAsync,
} = {}) {
  const linuxBackend = platform === 'linux' ? detectLinuxInputBackend(environment) : null;

  return {
    async execute(control) {
      const normalizedControl = normalizeInputAction(control);
      const commands = platform === 'linux'
        ? linuxBackend === 'wayland'
          ? buildYdotoolCommands(normalizedControl)
          : buildLinuxCommands(normalizedControl)
        : platform === 'win32'
          ? buildWindowsCommands(normalizedControl)
          : null;

      if (commands === null) {
        throw new Error(`Host input control is not supported on ${platform}.`);
      }

      if (commands.length === 0) {
        return normalizedControl;
      }

      try {
        for (const command of commands) {
          await execFileImpl(command.file, command.args);
        }
      } catch (error) {
        const isNotFound = error instanceof Error && 'code' in error && error.code === 'ENOENT';
        if (isNotFound) {
          const message = platform === 'linux'
            ? linuxBackend === 'wayland'
              ? 'Host input control on Wayland requires ydotool and a running ydotoold daemon on the host machine.'
              : 'Host input control requires xdotool to be installed on the host machine.'
            : 'Host input control requires PowerShell to be available on the host machine.';
          throw new Error(message);
        }

        const detail = error instanceof Error && typeof error.stderr === 'string' && error.stderr.trim()
          ? error.stderr.trim()
          : error instanceof Error ? error.message : '';
        const message = detail
          ? `Unable to apply input on the host machine. ${detail}`
          : 'Unable to apply input on the host machine.';
        throw new Error(message);
      }

      return normalizedControl;
    },
  };
}
