/**
 * PostCSS for all Vite-owned styles under styles/ (and any future CSS imports).
 * Nesting runs first so Autoprefixer sees flattened selectors.
 */
import autoprefixer from 'autoprefixer';
import postcssNesting from 'postcss-nesting';

export default {
    plugins: [postcssNesting(), autoprefixer()],
};
