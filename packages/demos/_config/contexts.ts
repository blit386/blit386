/**
 * Context data for example pages.
 * Each key is the HTML filename, values are Handlebars template variables.
 */
export const exampleContexts: Record<string, Record<string, string>> = {
    'basics.html': {
        title: 'Blit-Tech - Basic Example',
        h1Title: 'Blit-Tech Basic Example',
        scriptFile: '../src/basics',
    },

    'primitives.html': {
        title: 'Blit-Tech - Primitives Demo',
        h1Title: 'Blit-Tech Primitives Demo',
        scriptFile: '../src/primitives',
    },

    'camera.html': {
        title: 'Blit-Tech - Camera Demo',
        h1Title: 'Blit-Tech Camera Demo',
        scriptFile: '../src/camera',
    },

    'patterns.html': {
        title: 'Blit-Tech - Patterns Demo',
        h1Title: 'Blit-Tech Patterns Demo',
        scriptFile: '../src/patterns',
    },

    'sprites.html': {
        title: 'Blit-Tech - Sprite Demo',
        h1Title: 'Blit-Tech Sprite Demo',
        scriptFile: '../src/sprites',
    },

    'fonts.html': {
        title: 'Blit-Tech - Bitmap Font Demo',
        h1Title: 'Blit-Tech Bitmap Font Demo',
        scriptFile: '../src/fonts',
    },

    'sprite-effects.html': {
        title: 'Blit-Tech - Sprite Effects Demo',
        h1Title: 'Blit-Tech Sprite Effects Demo',
        scriptFile: '../src/sprite-effects',
    },

    'animation.html': {
        title: 'Blit-Tech - Animation & Timing Demo',
        h1Title: 'Blit-Tech Animation & Timing Demo',
        scriptFile: '../src/animation',
    },
};
