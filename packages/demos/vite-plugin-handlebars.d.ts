declare module 'vite-plugin-handlebars' {
    import type { Plugin } from 'vite';

    /**
     * Options for the vite-plugin-handlebars plugin
     */
    interface HandlebarsOptions {
        /** Directory or array of directories containing partial files (.hbs). */
        partialDirectory?: string;

        /** Function that returns context data for each page. */
        context?: (pagePath: string) => Record<string, string>;
    }

    /**
     * Vite plugin for Handlebars.
     * @param options - Options for the plugin.
     * @returns A Vite plugin.
     */
    export default function handlebars(options: HandlebarsOptions): Plugin;
}
