import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildDatedFilename,
  downloadSvgAsFile,
  downloadTextFile,
  serializeSvg,
} from './download';

const CREATE_URL = 'blob:mock-url';
const REVOKE_URL = 'blob:revoke-url';

function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function mockObjectUrls() {
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => CREATE_URL);
  const revokeObjectURL = vi.fn<(url: string) => void>(() => undefined);

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: revokeObjectURL,
  });

  return { createObjectURL, revokeObjectURL };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildDatedFilename', () => {
  it('slugifies the project name and appends the export kind and date', () => {
    expect(
      buildDatedFilename('Two-Storey Residence / Block, A', 'inventory', 'csv', new Date('2026-10-20T12:00:00Z')),
    ).toBe('two-storey-residence-block-a-inventory-2026-10-20.csv');
  });

  it('falls back to a generic slug when the project name has no usable characters', () => {
    expect(buildDatedFilename('!!!', 'cut-plans', 'svg', new Date('2026-01-05T00:00:00Z'))).toBe(
      'project-cut-plans-2026-01-05.svg',
    );
  });
});

describe('downloadTextFile', () => {
  it('creates a blob URL, clicks an anchor, and revokes the URL', () => {
    const { createObjectURL, revokeObjectURL } = mockObjectUrls();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    downloadTextFile('inventory.csv', 'id,type\r\n1,phenolic', 'text/csv;charset=utf-8');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith(CREATE_URL);
    expect(revokeObjectURL).not.toHaveBeenCalledWith(REVOKE_URL);
  });
});

describe('serializeSvg', () => {
  it('serializes the live SVG and guarantees the SVG namespace', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'cut-plan-sheet-0');
    svg.setAttribute('viewBox', '0 0 2.44 1.22');
    svg.innerHTML = '<rect width="1" height="1" />';

    const markup = serializeSvg(svg);

    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain('id="cut-plan-sheet-0"');
    expect(markup).toContain('<rect');
  });
});

describe('downloadSvgAsFile', () => {
  it('downloads the serialized SVG as image/svg+xml', async () => {
    const { createObjectURL } = mockObjectUrls();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'cut-plan-sheet-2');
    svg.innerHTML = '<rect width="1" height="1" />';

    downloadSvgAsFile('site-sheet-3.svg', svg);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('image/svg+xml;charset=utf-8');
    const text = await blobText(blob);
    expect(text).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(text).toContain('cut-plan-sheet-2');
  });
});
