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
