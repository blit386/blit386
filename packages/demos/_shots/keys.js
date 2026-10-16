/**
 * Keyboard map for the /shots gallery and its lightbox. Pure: takes the few event fields that
 * matter and returns an action name, so the bindings are unit-tested and the DOM handlers are a
 * switch over strings.
 *
 * Letters bind by `event.code` so they survive non-US layouts; punctuation that moves between
 * layouts (+, ?, #, /) binds by `event.key` and is written as `key:<char>`.
 */

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const KEY_PREFIX = 'key:';
const GALLERY_COLUMN = 2;
const LIGHTBOX_COLUMN = 3;

/**
 * @param {{ tagName?: string } | null | undefined} target
 * @returns {boolean}
 */
function isTypingTarget(target) {
    return Boolean(target && TYPING_TAGS.has(target.tagName));
}

// [code or key:<char>, shift (null = either), gallery action, lightbox action]
const BINDINGS = [
    ['ArrowLeft', false, 'focus-left', 'prev'],
    ['ArrowRight', false, 'focus-right', 'next'],
    ['KeyJ', false, 'focus-left', 'prev'],
    ['KeyK', false, 'focus-right', 'next'],
    ['ArrowUp', false, 'focus-up', 'pan-up'],
    ['ArrowDown', false, 'focus-down', 'pan-down'],
    ['ArrowLeft', true, 'extend-left', 'pan-fast-left'],
    ['ArrowRight', true, 'extend-right', 'pan-fast-right'],
    ['ArrowUp', true, 'extend-up', 'pan-fast-up'],
    ['ArrowDown', true, 'extend-down', 'pan-fast-down'],
    ['Home', null, 'focus-home', 'first'],
    ['End', null, 'focus-end', 'last'],
    ['PageUp', null, 'page-up', 'demo-prev'],
    ['PageDown', null, 'page-down', 'demo-next'],
    ['KeyN', false, 'demo-next', 'demo-next'],
    ['KeyP', false, 'demo-prev', 'demo-prev'],
    ['Enter', false, 'open', 'close'],
    ['KeyO', false, 'open', 'close'],
    ['Space', false, 'toggle-select', 'close'],
    ['Escape', null, 'escape', 'close'],
    ['KeyO', true, 'open-live', 'open-live'],
    ['KeyA', false, 'select-all', null],
    ['KeyA', true, 'select-none', null],
    ['KeyG', false, 'stack-focused', null],
    ['KeyG', true, 'stack-all', null],
    ['KeyV', false, 'variant-next', 'variant-next'],
    ['KeyD', false, 'diff-toggle', 'diff-toggle'],
    ['KeyB', false, 'diff-cycle', 'diff-cycle'],
    ['KeyL', false, 'lint-toggle', null],
    ['KeyI', false, 'info-toggle', 'info-toggle'],
    ['KeyX', false, 'flag', 'flag'],
    ['KeyM', false, 'note', 'note'],
    ['KeyE', false, 'export', null],
    ['KeyY', false, 'copy-path', 'copy-path'],
    ['KeyC', false, 'capture-selected', null],
    ['KeyC', true, 'capture-all', null],
    ['Digit1', false, null, 'zoom-1'],
    ['Digit2', false, null, 'zoom-2'],
    ['Digit4', false, null, 'zoom-4'],
    ['key:+', null, null, 'zoom-in'],
    ['key:=', null, null, 'zoom-in'],
    ['key:-', null, null, 'zoom-out'],
    ['key:#', null, null, 'grid-toggle'],
    ['key:?', null, 'help', 'help'],
    ['key:/', null, 'filter', null],
];

// Actions shots.js answers itself in either mode, before the gallery or the lightbox sees them.
const SHARED_ACTIONS = [
    'help',
    'info-toggle',
    'open-live',
    'copy-path',
    'flag',
    'note',
    'export',
    'diff-toggle',
    'diff-cycle',
    'filter',
];

/**
 * Does one binding's trigger match this event? A `key:` trigger compares `event.key`,
 * anything else compares `event.code`.
 *
 * @param {[string, boolean | null, unknown, unknown]} binding
 * @param {{ code: string, key: string, shiftKey: boolean }} event
 * @returns {boolean}
 */
function matchesBinding(binding, event) {
    const [trigger, shift] = binding;
    const triggerMatches = trigger.startsWith(KEY_PREFIX)
        ? trigger.slice(KEY_PREFIX.length) === event.key
        : trigger === event.code;

    return triggerMatches && (shift === null || shift === event.shiftKey);
}

/**
 * @param {{ code: string, key: string, shiftKey: boolean, target?: { tagName?: string } }} event
 * @param {'gallery' | 'lightbox'} mode
 * @returns {string | null} The action name, or null when the key is unbound in this mode.
 */
function resolveKey(event, mode) {
    // Text fields keep every key except Escape, which still leaves the field.
    if (isTypingTarget(event.target)) {
        return event.code === 'Escape' ? 'escape' : null;
    }

    const column = mode === 'gallery' ? GALLERY_COLUMN : LIGHTBOX_COLUMN;
    const hit = BINDINGS.find((binding) => binding[column] && matchesBinding(binding, event));

    return hit ? hit[column] : null;
}

// Rows for the help overlay. A row whose gallery cell names two actions (d b, l i) is one row.
const KEY_HELP = [
    { keys: 'Left Right j k', gallery: 'focus previous / next tile', lightbox: 'previous / next image' },
    { keys: 'Up Down', gallery: 'nearest tile in the previous / next row', lightbox: 'pan when zoomed' },
    { keys: 'Home End', gallery: 'first / last tile', lightbox: 'first / last image' },
    { keys: 'PageUp PageDown', gallery: 'one screen up / down', lightbox: 'previous / next demo' },
    { keys: 'n p', gallery: 'next / previous demo', lightbox: 'next / previous demo' },
    { keys: 'Enter o', gallery: 'open lightbox', lightbox: 'close lightbox' },
    { keys: 'Space', gallery: 'toggle selection', lightbox: 'close lightbox' },
    { keys: 'Esc', gallery: 'clear filter, then selection', lightbox: 'close lightbox' },
    { keys: 'Shift+Arrow', gallery: 'extend selection', lightbox: 'fast pan' },
    { keys: 'a Shift+A', gallery: 'select all / none', lightbox: '' },
    { keys: 'g Shift+G', gallery: 'toggle focused stack / stack or unstack all', lightbox: '' },
    { keys: 'v', gallery: 'cycle variant', lightbox: 'cycle variant' },
    { keys: 'd b', gallery: 'toggle diff / cycle current, baseline, diff', lightbox: 'same' },
    { keys: 'l i', gallery: 'toggle lint badges / info panel', lightbox: 'toggle info panel' },
    { keys: '+ - 1 2 4', gallery: '', lightbox: 'zoom in / out / presets' },
    { keys: '#', gallery: '', lightbox: 'pixel grid at 400 percent' },
    { keys: 'x m e', gallery: 'flag / note / export findings', lightbox: 'flag / note' },
    { keys: 'y', gallery: 'copy PNG path', lightbox: 'copy PNG path' },
    { keys: 'Shift+O', gallery: 'open the live demo in a new tab', lightbox: 'same' },
    { keys: '/', gallery: 'focus filter', lightbox: '' },
    { keys: 'c Shift+C', gallery: 'capture selected / all (dev only)', lightbox: '' },
    { keys: '?', gallery: 'this help', lightbox: 'this help' },
];

/** While the help overlay is open, only these keys do anything: they close it. */
function closesHelp(event) {
    return event.key === '?' || event.key === 'Escape';
}

export { BINDINGS, closesHelp, isTypingTarget, KEY_HELP, resolveKey, SHARED_ACTIONS };
