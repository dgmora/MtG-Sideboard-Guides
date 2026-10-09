// ─── Print-ready PDF ──────────────────────────────────────────────────────────
// The PDF is written by hand so the page loads no library. The guide goes in as
// a 600 dpi image because the fonts every PDF viewer has can't show non-Latin names.
const A4_MM = { width: 210, height: 297 };
const TOP_MM = 12;
const DPI = 600;
const MM_TO_PT = 72 / 25.4;

function guideSize(svg) {
  const [, width, height] = svg.match(/<svg[^>]* width="(\d+)mm" height="(\d+)mm"/) ?? [];
  if (!width) throw new Error('the guide has no size in millimetres');
  if (+width > A4_MM.width) throw new Error(`the guide is ${width} mm wide and does not fit on an A4 page`);
  return { width: +width, height: +height };
}

function pdfPlacement({ width, height }) {
  return { x: (A4_MM.width - width) / 2, y: TOP_MM, width, height };
}

async function renderJPEG(svg, { width, height }) {
  const pixels = { width: Math.round(width / 25.4 * DPI), height: Math.round(height / 25.4 * DPI) };
  // Sizing the SVG in pixels keeps browsers from upscaling a low-resolution bitmap
  const sized = svg.replace(/ width="\d+mm" height="\d+mm"/, ` width="${pixels.width}" height="${pixels.height}"`);
  const image = new Image();
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized);
  await image.decode();
  const canvas = document.createElement('canvas');
  Object.assign(canvas, pixels);
  canvas.getContext('2d').drawImage(image, 0, 0);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('the browser could not draw the guide');
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), pixels };
}

function buildPDF(jpeg, pixels, { x, y, width, height }) {
  const pt = mm => +(mm * MM_TO_PT).toFixed(2);
  const draw = `q ${pt(width)} 0 0 ${pt(height)} ${pt(x)} ${pt(A4_MM.height - y - height)} cm /Guide Do Q`;
  const objects = [
    // PrintScaling /None makes print dialogs start at actual size instead of fit to page
    '<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(A4_MM.width)} ${pt(A4_MM.height)}] /Resources << /XObject << /Guide 4 0 R >> >> /Contents 5 0 R >>`,
    [`<< /Type /XObject /Subtype /Image /Width ${pixels.width} /Height ${pixels.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream'],
    `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`,
  ];

  const encoder = new TextEncoder();
  const chunks = [];
  let size = 0;
  const write = part => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    chunks.push(bytes);
    size += bytes.length;
  };

  write('%PDF-1.4\n');
  const offsets = objects.map((body, i) => {
    const offset = size;
    write(`${i + 1} 0 obj\n`);
    [body].flat().forEach(write);
    write('\nendobj\n');
    return offset;
  });
  const xref = size;
  write(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.forEach(offset => write(`${String(offset).padStart(10, '0')} 00000 n \n`));
  write(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}

async function createGuidePDF(svg) {
  const size = guideSize(svg);
  const { jpeg, pixels } = await renderJPEG(svg, size);
  return buildPDF(jpeg, pixels, pdfPlacement(size));
}

if (typeof module === 'object') {
  module.exports = { guideSize, pdfPlacement, buildPDF };
}
