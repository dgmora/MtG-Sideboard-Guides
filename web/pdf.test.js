// Run with: node web/pdf.test.js
const assert = require('node:assert/strict');
const { guideDimensions, pdfPlacement, createGuidePDF } = require('./pdf.js');
const { EXAMPLE_SHEET, parseData, buildPivot, generateCardSVG } = require('./guide.js');

const svgElement = svgText => ({
  getAttribute(name) { return svgText.match(new RegExp(name + '="([^"]+)"'))?.[1] ?? null; },
});

// The export uses the size encoded in the actual SVG generator, not CSS pixels.
const foldedSVG = svgElement(generateCardSVG('DnT', buildPivot(parseData(EXAMPLE_SHEET), '')));
assert.deepEqual(guideDimensions(foldedSVG), { width: 126, height: 88 });
assert.deepEqual(pdfPlacement(foldedSVG), { x: 42, y: 12, width: 126, height: 88 });

const singleSVG = svgElement(generateCardSVG('', buildPivot(parseData('md,sb,Card,Elves\n4,,Island,-1'), '')));
assert.deepEqual(pdfPlacement(singleSVG), { x: 73.5, y: 12, width: 63, height: 88 });

assert.throws(() => guideDimensions(svgElement('<svg width="126px" height="88mm"/>')), /Unexpected card size/);
assert.throws(() => guideDimensions(svgElement('<svg width="126mm" height="90mm"/>')), /Unexpected card size/);

const calls = [];
class FakePDF {
  constructor(options) { calls.push(['constructor', options]); }
  async svg(element, options) { calls.push(['svg', element, options]); }
  setDrawColor(...args) { calls.push(['color', ...args]); }
  setLineWidth(...args) { calls.push(['lineWidth', ...args]); }
  line(...args) { calls.push(['line', ...args]); }
}

(async () => {
  await createGuidePDF(foldedSVG, FakePDF);
  assert.deepEqual(calls[0][1], { orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  assert.equal(calls[1][1], foldedSVG);
  assert.deepEqual(calls[1][2], { x: 42, y: 12, width: 126, height: 88 });
  assert.equal(calls.filter(([kind]) => kind === 'line').length, 8); // two crop marks per corner
  console.log('ok');
})().catch(err => { console.error(err); process.exitCode = 1; });
