import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_DISPLAY_DIMENSION = 16_384;
const MAX_SCROLL_STEPS = 12;
const MAX_KEY_IDENTIFIER_LENGTH = 64;
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
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${field} must be a finite number between ${min} and ${max}.`);
  }

  return value;
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
  return toFiniteNumber(value, field, { min: 0, max: 1 });
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

export function createInputController({ platform = process.platform, execFileImpl = execFileAsync } = {}) {
  return {
    async execute(control) {
      const normalizedControl = normalizeInputAction(control);
      const commands = platform === 'linux'
        ? buildLinuxCommands(normalizedControl)
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
        const message = error instanceof Error && 'code' in error && error.code === 'ENOENT'
          ? platform === 'linux'
            ? 'Host input control requires xdotool to be installed on the host machine.'
            : 'Host input control requires PowerShell to be available on the host machine.'
          : 'Unable to apply input on the host machine.';
        throw new Error(message);
      }

      return normalizedControl;
    },
  };
}
