// Regenerates img/example_guide.png. Needs rsvg-convert (brew install librsvg).
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { EXAMPLE_SHEET, parseData, buildPivot, generateCardSVG } = require('../web/guide.js');

const svg = generateCardSVG('Death and Taxes', buildPivot(parseData(EXAMPLE_SHEET), ''));
const output = path.join(__dirname, '..', 'img', 'example_guide.png');
execFileSync('rsvg-convert', ['-w', '1260', '-o', output], { input: svg });
