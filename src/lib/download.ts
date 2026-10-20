const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function buildDatedFilename(
  projectName: string,
  kind: string,
  extension: string,
  date: Date = new Date(),
): string {
  const slug = projectName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${slug || 'project'}-${kind}-${date.toISOString().slice(0, 10)}.${extension}`;
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', SVG_NAMESPACE);
  return new XMLSerializer().serializeToString(clone);
}

export function downloadSvgAsFile(filename: string, svg: SVGSVGElement): void {
  downloadTextFile(filename, serializeSvg(svg), 'image/svg+xml;charset=utf-8');
}

function svgAspectRatio(svg: SVGSVGElement): number {
  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const [, , width, height] = viewBox.trim().split(/[\s,]+/).map(Number);
    if (width && height && width > 0) return height / width;
  }

  const width = Number(svg.getAttribute('width'));
  const height = Number(svg.getAttribute('height'));
  if (width > 0 && height > 0) return height / width;

  return 1;
}

export async function downloadSvgAsPng(
  filename: string,
  svg: SVGSVGElement,
  targetWidth = 1600,
): Promise<void> {
  const blob = new Blob([serializeSvg(svg)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not load the SVG for export.'));
      image.src = url;
    });

    const width = Math.max(1, Math.round(targetWidth));
    const height = Math.max(1, Math.round(width * svgAspectRatio(svg)));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create a canvas for export.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const anchor = document.createElement('a');
    anchor.href = canvas.toDataURL('image/png');
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
