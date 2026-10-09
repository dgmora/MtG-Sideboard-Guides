// ─── Print-ready PDF export ───────────────────────────────────────────────────
// Keep the guide in physical millimetres; never fit it to the PDF page.
const PDF_PAGE_WIDTH_MM = 210;
const CARD_HEIGHT_MM = 88;
const CARD_TOP_MM = 12;

function guideDimensions(svg) {
  const width = svg.getAttribute('width');
  const height = svg.getAttribute('height');
  if (!['63mm', '126mm'].includes(width) || height !== '88mm') {
    throw new Error('Unexpected card size: expected 63 or 126 × 88 mm');
  }
  return { width: parseInt(width, 10), height: CARD_HEIGHT_MM };
}

function pdfPlacement(svg) {
  const { width, height } = guideDimensions(svg);
  return {
    x: (PDF_PAGE_WIDTH_MM - width) / 2,
    y: CARD_TOP_MM,
    width,
    height,
  };
}

function drawCutMarks(pdf, { x, y, width, height }) {
  const gap = 1, length = 3;
  pdf.setDrawColor(100);
  pdf.setLineWidth(0.15);
  for (const edgeX of [x, x + width]) {
    for (const edgeY of [y, y + height]) {
      const signX = edgeX === x ? -1 : 1;
      const signY = edgeY === y ? -1 : 1;
      pdf.line(edgeX + signX * gap, edgeY, edgeX + signX * (gap + length), edgeY);
      pdf.line(edgeX, edgeY + signY * gap, edgeX, edgeY + signY * (gap + length));
    }
  }
}

// PDFConstructor is injectable so node tests can verify the real drawing dimensions.
async function createGuidePDF(svg, PDFConstructor) {
  const placement = pdfPlacement(svg);
  const pdf = new PDFConstructor({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  await pdf.svg(svg, placement);
  drawCutMarks(pdf, placement);
  return pdf;
}

if (typeof module === 'object') {
  module.exports = { guideDimensions, pdfPlacement, createGuidePDF };
}
