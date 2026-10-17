/**
 * Short on-screen names for KeyboardEvent.code strings, shared by the demos that show
 * which keys feed which buttons (Keyboard Input, Input Map Remapping).
 *
 * The arrow keys use the arrow characters the system font carries; a few long named keys
 * get a three-letter form so they fit narrow key columns.
 */

/** @type {Readonly<Record<string, string>>} */
const KEY_SHORT_NAMES = Object.freeze({
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: 'Spc',
    Escape: 'Esc',
    Backspace: 'Bks',
    Semicolon: ';',
    Quote: "'",
});

/** @type {Readonly<Record<string, string>>} */
const NUMPAD_SYMBOLS = Object.freeze({
    Divide: '/',
    Multiply: '*',
    Subtract: '-',
    Add: '+',
    Decimal: '.',
});

/**
 * The short label for one key code: `KeyW` -> `W`, `Digit5` -> `5`, `ArrowUp` -> an
 * up arrow, `Numpad1` -> `Num1`, `NumpadDivide` -> `Num/`. Anything else passes through.
 *
 * @param {string} code - A KeyboardEvent.code string.
 * @returns {string}
 */
function keyLabel(code) {
    const named = KEY_SHORT_NAMES[code];

    if (named !== undefined) {
        return named;
    }

    if (code.startsWith('Key')) {
        return code.slice(3);
    }

    if (code.startsWith('Digit')) {
        return code.slice(5);
    }

    if (code.startsWith('Numpad')) {
        const rest = code.slice(6);

        return `Num${NUMPAD_SYMBOLS[rest] ?? rest}`;
    }

    return code;
}

export { keyLabel };
