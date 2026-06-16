#!/usr/bin/env node

/**
 * BMFont to .btfont Converter
 *
 * Converts BMFont XML format (.fnt + .png) to BLIT386's .btfont JSON format.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * Extracts the value of a specified attribute from an XML tag.
 *
 * @param {string} tag - The XML tag string from which to extract the attribute value.
 * @param {string} attr - The name of the attribute to extract.
 * @returns {string|null} The value of the specified attribute, or null if the attribute is not found.
 */
function parseXmlAttribute(tag, attr) {
    const regex = new RegExp(`${attr}="([^"]*)"`, 'i');
    const match = tag.match(regex);

    return match ? match[1] : null;
}

/**
 * Parses the `<info>` XML tag from the provided font file data and extracts the font name and size.
 *
 * @param {string} xmlData - The XML data containing the font information, including the `<info>` tag.
 * @returns {{fontName: string, fontSize: number}} An object containing the `fontName` and `fontSize` extracted from the `<info>` tag. Defaults to 'Unknown' for font name and 12 for font size if attributes are missing.
 */
function parseInfoTag(xmlData) {
    const infoMatch = xmlData.match(/<info[^>]+>/);

    if (!infoMatch) {
        console.error('Error: Couldn’t find <info> tag in font file');

        process.exit(1);
    }

    const fontName = parseXmlAttribute(infoMatch[0], 'face') || 'Unknown';
    const sizeAttr = parseXmlAttribute(infoMatch[0], 'size') || '12';
    const fontSize = Math.abs(parseInt(sizeAttr, 10));

    if (Number.isNaN(fontSize)) {
        console.error(`Error: Invalid font size in <info> tag: "${sizeAttr}"`);

        process.exit(1);
    }

    return { fontName, fontSize };
}

/**
 * Parses the `<common>` tag from the provided XML data and extracts font-related attributes.
 *
 * @param {string} xmlData - The XML data containing the `<common>` tag.
 * @param {number} fontSize - The font size to be used as a fallback value if attributes are missing.
 * @returns {{lineHeight: number, baseline: number}} An object containing the parsed `lineHeight` and `baseline` values from the `<common>` tag.
 */
function parseCommonTag(xmlData, fontSize) {
    const commonMatch = xmlData.match(/<common[^>]+>/);

    if (!commonMatch) {
        console.error('Error: Couldn’t find <common> tag in font file');

        process.exit(1);
    }

    const lineHeightAttr = parseXmlAttribute(commonMatch[0], 'lineHeight') || String(fontSize);
    const baselineAttr = parseXmlAttribute(commonMatch[0], 'base') || String(fontSize);

    const lineHeight = parseInt(lineHeightAttr, 10);
    const baseline = parseInt(baselineAttr, 10);

    if (Number.isNaN(lineHeight)) {
        console.error(`Error: Invalid lineHeight in <common> tag: "${lineHeightAttr}"`);

        process.exit(1);
    }

    if (Number.isNaN(baseline)) {
        console.error(`Error: Invalid baseline (base) in <common> tag: "${baselineAttr}"`);

        process.exit(1);
    }

    return { lineHeight, baseline };
}

/**
 * Parses the <page> tag in the provided XML data to extract the texture filename.
 * Multipage BMFonts aren't supported and will cause an error.
 * Logs an error and terminates the process if no <page> tag is found, multiple <page> tags exist,
 * or the texture filename is missing.
 *
 * @param {string} xmlData The XML data containing the <page> tag to be parsed.
 * @returns {string} The texture filename extracted from the single <page> tag.
 */
function parsePageTag(xmlData) {
    const pageMatches = [...xmlData.matchAll(/<page[^>]+>/g)];

    if (pageMatches.length === 0) {
        console.error('Error: Couldn’t find <page> tag in font file');

        process.exit(1);
    }

    if (pageMatches.length > 1) {
        console.error(`Error: Multi-page BMFonts aren’t supported (found ${pageMatches.length} <page> tags)`);
        console.error('This font uses multiple texture pages, which is not supported.');

        process.exit(1);
    }

    const textureFilename = parseXmlAttribute(pageMatches[0][0], 'file');

    if (!textureFilename) {
        console.error('Error: Couldn’t find texture filename in <page> tag');

        process.exit(1);
    }

    return textureFilename;
}

/**
 * Generates and returns the appropriate texture value based on the specified options.
 * This can either be an embedded base64 representation of the texture or a path to the texture file.
 *
 * @param {boolean} embedTexture - Indicates whether the texture should be embedded in base64 format.
 * @param {string} textureFilename - The filename of the texture file to be used.
 * @param {string} fntDir - The directory where the texture file is located.
 * @param {string} outputPath - The output path used for computing relative paths if embedding is off.
 * @returns {string} The texture value, either as a base64-encoded string or a relative path.
 */
function getTextureValue(embedTexture, textureFilename, fntDir, outputPath) {
    let textureValue;
    const texturePath = join(fntDir, textureFilename);

    // Prevent path traversal attacks by ensuring texturePath stays within fntDir.
    const resolvedTexturePath = resolve(texturePath);
    const resolvedFntDir = resolve(fntDir);

    // Ensure the resolved directory ends with a separator to prevent sibling directory bypass
    // (e.g., /home/user/fonts and /home/user/fonts-backup).
    const normalizedFntDir = resolvedFntDir.endsWith(sep) ? resolvedFntDir : resolvedFntDir + sep;

    if (!resolvedTexturePath.startsWith(normalizedFntDir)) {
        console.error(`Error: The texture path escapes the font directory: ${textureFilename}`);

        process.exit(1);
    }

    if (embedTexture) {
        // Validate texture file existence.
        if (!existsSync(resolvedTexturePath)) {
            console.error(`Error: The texture file was not found: ${resolvedTexturePath}`);

            process.exit(1);
        }

        console.log(`Embedding texture: ${resolvedTexturePath}`);

        try {
            const pngData = readFileSync(resolvedTexturePath);
            const base64 = pngData.toString('base64');

            console.log(`  Texture size: ${pngData.length} bytes (${base64.length} base64)`);

            textureValue = `data:image/png;base64,${base64}`;
        } catch (error) {
            console.error(`Error reading the texture file: ${error.message}`);

            process.exit(1);
        }
    } else {
        // Use the relative path from output file to texture.
        const resolvedOutputPath = resolve(outputPath);
        const outputDir = dirname(resolvedOutputPath);

        // Validate texture file existence.
        if (!existsSync(resolvedTexturePath)) {
            console.error(`Error: The texture file was not found: ${resolvedTexturePath}`);

            process.exit(1);
        }

        // Compute a relative path from the output directory to the texture file.
        textureValue = relative(outputDir, resolvedTexturePath).replace(/\\/g, '/');

        console.log(`Texture reference: ${textureValue}`);
    }

    return textureValue;
}

/**
 * Parses glyph data from a given XML tag and updates the glyph object with the corresponding character's properties.
 *
 * @param {Object} glyphs - The object representing all glyph data, which will be updated with the parsed character information.
 * @param {string} char - The character corresponding to the glyph data being parsed.
 * @param {string} tag - The XML tag containing the attributes for the glyph's properties.
 * @param {number} charCode - The character code for error reporting.
 * @returns {void} Does not return a value; updates the glyph object directly with parsed data.
 */
function parseGlyphData(glyphs, char, tag, charCode) {
    // Parse all numeric attributes with defaults.
    const xAttr = parseXmlAttribute(tag, 'x') || '0';
    const yAttr = parseXmlAttribute(tag, 'y') || '0';
    const widthAttr = parseXmlAttribute(tag, 'width') || '0';
    const heightAttr = parseXmlAttribute(tag, 'height') || '0';
    const xoffsetAttr = parseXmlAttribute(tag, 'xoffset') || '0';
    const yoffsetAttr = parseXmlAttribute(tag, 'yoffset') || '0';
    const xadvanceAttr = parseXmlAttribute(tag, 'xadvance') || '0';

    const x = parseInt(xAttr, 10);
    const y = parseInt(yAttr, 10);
    const width = parseInt(widthAttr, 10);
    const height = parseInt(heightAttr, 10);
    const xoffset = parseInt(xoffsetAttr, 10);
    const yoffset = parseInt(yoffsetAttr, 10);
    const xadvance = parseInt(xadvanceAttr, 10);

    // Validate all numeric values.
    const attributes = [
        { name: 'x', value: x, attr: xAttr },
        { name: 'y', value: y, attr: yAttr },
        { name: 'width', value: width, attr: widthAttr },
        { name: 'height', value: height, attr: heightAttr },
        { name: 'xoffset', value: xoffset, attr: xoffsetAttr },
        { name: 'yoffset', value: yoffset, attr: yoffsetAttr },
        { name: 'xadvance', value: xadvance, attr: xadvanceAttr },
    ];

    for (const { name, value, attr } of attributes) {
        if (Number.isNaN(value)) {
            console.error(`Error: Invalid ${name} attribute for the glyph (char code ${charCode}): "${attr}"`);

            process.exit(1);
        }
    }

    // eslint-disable-next-line security/detect-object-injection
    glyphs[char] = {
        x,
        y,
        w: width,
        h: height,
        ox: xoffset,
        oy: yoffset,
        adv: xadvance,
    };
}

/**
 * Parses glyph data from an XML string containing font information and extracts individual character properties.
 *
 * @param {string} xmlData - The XML string containing font glyph definitions.
 * @returns {{glyphs: Object, glyphCount: number}} An object containing the parsed glyphs as key-value pairs and the total count of glyphs found.
 */
function parseGlyphs(xmlData) {
    const glyphs = Object.create(null); // use Object.create(null) to prevent prototype pollution
    let glyphCount = 0;

    for (const charMatch of xmlData.matchAll(/<char[^>]+>/g)) {
        const tag = charMatch[0];
        const idAttr = parseXmlAttribute(tag, 'id');

        // Validate that the ID attribute exists and is numeric.
        if (!idAttr) {
            console.error('Error: The glyph is missing a required id attribute');

            process.exit(1);
        }

        const charCode = parseInt(idAttr, 10);

        if (Number.isNaN(charCode)) {
            console.error(`Error: The glyph has a non-numeric id: ${idAttr}`);

            process.exit(1);
        }

        const char = String.fromCharCode(charCode);

        parseGlyphData(glyphs, char, tag, charCode);

        glyphCount++;
    }

    if (glyphCount === 0) {
        console.error('Error: No glyphs are found in the font file');

        process.exit(1);
    }

    return { glyphs, glyphCount };
}

/**
 * Writes the given font data to a file and logs the conversion details.
 *
 * @param {string} outputPath - The path where the font data will be written.
 * @param {object} btfont - The font data to be serialized and written to the file.
 * @param {string} fontName - The name of the font being processed.
 * @param {number} fontSize - The size of the font, in points.
 * @param {number} lineHeight - The line height of the font, in pixels.
 * @param {number} baseline - The baseline offset of the font, in pixels.
 * @param {number} glyphCount - The total number of glyphs in the font.
 * @returns {void} This function doesn't return a value.
 */
function writeOutput(outputPath, btfont, fontName, fontSize, lineHeight, baseline, glyphCount) {
    writeFileSync(outputPath, JSON.stringify(btfont, null, 2));

    console.log(`\nConverted successfully!`);
    console.log(`  Output: ${outputPath}`);
    console.log(`  Font: ${fontName} ${fontSize}pt`);
    console.log(`  Line height: ${lineHeight}px`);
    console.log(`  Baseline: ${baseline}px`);
    console.log(`  Glyphs: ${glyphCount}`);
}

/**
 * Converts a BMFont `.fnt` file to a `.btfont` format file.
 *
 * @param {string} fntPath - The path to the input `.fnt` file. This should be a valid BMFont XML file.
 * @param {string} outputPath - The path where the converted `.btfont` file will be saved.
 * @param {boolean} [embedTexture=false] - Whether to embed the texture file as a base64-encoded string within the output `.btfont` file. Defaults to `false`.
 * @returns {void} Does not return a value. The converted file is saved to the specified output path.
 */
function convertBMFont(fntPath, outputPath, embedTexture = false) {
    // Validate input file exists.
    if (!existsSync(fntPath)) {
        console.error(`Error: The input file was not found: ${fntPath}`);

        process.exit(1);
    }

    console.log(`Reading: ${fntPath}`);

    // Read the XML font file.
    const xmlData = readFileSync(fntPath, 'utf-8');
    const fntDir = dirname(fntPath);

    // Parse XML tags.
    const { fontName, fontSize } = parseInfoTag(xmlData);
    const { lineHeight, baseline } = parseCommonTag(xmlData, fontSize);
    const textureFilename = parsePageTag(xmlData);
    const textureValue = getTextureValue(embedTexture, textureFilename, fntDir, outputPath);
    const { glyphs, glyphCount } = parseGlyphs(xmlData);

    // Create the .btfont structure.
    const btfont = {
        name: fontName,
        size: fontSize,
        lineHeight,
        baseline,
        texture: textureValue,
        glyphs,
    };

    // Write the output.
    writeOutput(outputPath, btfont, fontName, fontSize, lineHeight, baseline, glyphCount);
}

/**
 * Main function that serves as the entry point for the BMFont to .btfont converter.
 * It processes command-line arguments, provides help instructions, and initiates the
 * conversion process from BMFont XML format to BLIT386's .btfont JSON format.
 *
 * Behavior:
 * - If no arguments are provided, `--help`, or `-h` is passed, usage instructions
 *   are displayed and the program exits successfully (status 0).
 * - If insufficient arguments are passed (less than 2 paths), an error message
 *   is displayed and the program exits with an error code (status 1).
 *
 * @returns {void} This function doesn't return a value. It either executes the
 * conversion process or exits the process with a relevant status code.
 */
function main() {
    const args = process.argv.slice(2);

    // Check for the help flag.
    if (args.includes('--help') || args.includes('-h') || args.length === 0) {
        console.log(`
BMFont to .btfont Converter

Converts BMFont XML format (.fnt + .png) to BLIT386’s .btfont JSON format.

Usage:
  node tools/convert-bmfont.mjs <input.fnt> <output.btfont> [--embed]

Options:
  --embed        Embed the texture as base64 instead of referencing it
  -h, --help     Show this help message

Examples:
  node tools/convert-bmfont.mjs fonts/MyFont.fnt fonts/MyFont.btfont
  node tools/convert-bmfont.mjs fonts/MyFont.fnt fonts/MyFont.btfont --embed
`);
        process.exit(0);
    }

    // Parse arguments.
    const embedTexture = args.includes('--embed');
    const paths = args.filter((arg) => !arg.startsWith('-'));

    // Validate no unknown flags.
    const knownFlags = ['-h', '--help', '--embed'];
    const unknownFlags = args.filter((arg) => arg.startsWith('-') && !knownFlags.includes(arg));

    if (unknownFlags.length > 0) {
        console.error(`Error: Unknown flag(s): ${unknownFlags.join(', ')}`);
        console.error('Usage: node tools/convert-bmfont.mjs <input.fnt> <output.btfont> [--embed]');
        console.error('Run with --help for more information');

        process.exit(1);
    }

    if (paths.length < 2) {
        console.error('Error: Please provide input and output paths');
        console.error('Usage: node tools/convert-bmfont.mjs <input.fnt> <output.btfont> [--embed]');

        process.exit(1);
    }

    // Validate no extra positional arguments.
    if (paths.length !== 2) {
        console.error(`Error: Expected 2 paths, but got ${paths.length}: ${paths.join(', ')}`);
        console.error('Usage: node tools/convert-bmfont.mjs <input.fnt> <output.btfont> [--embed]');

        process.exit(1);
    }

    const [inputPath, outputPath] = paths;

    // Run conversion.
    convertBMFont(inputPath, outputPath, embedTexture);
}

main();
