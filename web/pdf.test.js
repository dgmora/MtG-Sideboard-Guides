// Run with: node web/pdf.test.js
const assert = require('node:assert/strict');
const { guideSize, pdfPlacement, buildPDF } = require('./pdf.js');
const { EXAMPLE_SHEET, parseData, buildPivot, generateCardSVG } = require('./guide.js');

const svgFor = sheet => generateCardSVG('DnT', buildPivot(parseData(sheet), ''));

assert.deepEqual(pdfPlacement(guideSize(svgFor('md,sb,Card,Elves\n4,,Island,-1'))), { x: 73.5, y: 104.5, width: 63, height: 88 });
assert.deepEqual(pdfPlacement(guideSize(svgFor(EXAMPLE_SHEET))), { x: 42, y: 104.5, width: 126, height: 88 });
assert.deepEqual(pdfPlacement(guideSize(svgFor('md,sb,Card,A,,B,,C\n4,,Island,-1,,-1,,-1'))), { x: 10.5, y: 104.5, width: 189, height: 88 });
assert.throws(() => guideSize(svgFor('md,sb,Card,A,,B,,C,,D\n4,,Island,-1,,-1,,-1,,-1')), /252 mm wide and does not fit on an A4 page/);

(async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const blob = buildPDF(jpeg, { width: 2976, height: 2079 }, { x: 42, y: 12, width: 126, height: 88 });
  const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');

  assert.equal(blob.type, 'application/pdf');
  assert.match(pdf, /\/MediaBox \[0 0 595.28 841.89\]/);
  assert.ok(pdf.startsWith('%PDF-1.6\n'), 'PrintScaling needs PDF 1.6');
  assert.match(pdf, /\/PrintScaling \/None/);
  assert.match(pdf, /\/Width 2976 \/Height 2079 .* \/Length 4 >>\nstream\n\xff\xd8\xff\xd9\nendstream/);
  // 126 × 88 mm, 42 mm from the left and 12 mm from the top, in points from the bottom left
  assert.match(pdf, /q 357.17 0 0 249.45 119.06 558.43 cm \/Guide Do Q/);

  const xref = +pdf.match(/startxref\n(\d+)/)[1];
  assert.ok(pdf.startsWith('xref\n0 6\n', xref));
  const offsets = [...pdf.slice(xref).matchAll(/(\d{10}) 00000 n /g)].map(m => +m[1]);
  assert.deepEqual(offsets.map(offset => pdf.slice(offset, offset + 7)), ['1 0 obj', '2 0 obj', '3 0 obj', '4 0 obj', '5 0 obj']);
  console.log('ok');
})().catch(err => { console.error(err); process.exitCode = 1; });
