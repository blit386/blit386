/**
 * PostCSS for every stylesheet Vite processes (styles/ and the _shots/*.css pages).
 * Nesting runs first so Autoprefixer sees flattened selectors.
 */
import autoprefixer from 'autoprefixer';
import postcssNesting from 'postcss-nesting';

export default {
    plugins: [postcssNesting(), autoprefixer()],
};
