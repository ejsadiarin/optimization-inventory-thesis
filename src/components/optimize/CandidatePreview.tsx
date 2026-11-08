import { Badge } from '@/components/ui/badge';
import type { InventoryMatch, MatchRequirement } from '@/engine/types';
import { formatMeters, shortId } from '@/lib/format';

const PADDING = 0.09;
const FIT_TOLERANCE = 1e-9;
const LUMBER_PREVIEW_WIDTH = 0.18;

interface PreviewShape {
  boardLength: number;
  boardWidth: number;
  panelLength: number;
  panelWidth: number;
}

function phenolicShape(
  requirement: MatchRequirement,
  candidate: InventoryMatch,
): PreviewShape {
  const requiredLength = requirement.length;
  const requiredWidth = requirement.width ?? 0;
  const orientations = [
    { boardLength: candidate.piece.length, boardWidth: candidate.piece.width },
    { boardLength: candidate.piece.width, boardWidth: candidate.piece.length },
  ]
    .filter(
      (orientation) =>
        orientation.boardLength + FIT_TOLERANCE >= requiredLength &&
        orientation.boardWidth + FIT_TOLERANCE >= requiredWidth,
    )
    .sort(
      (a, b) =>
        (a.boardLength - requiredLength) * (a.boardWidth - requiredWidth) -
        (b.boardLength - requiredLength) * (b.boardWidth - requiredWidth),
    );

  const best = orientations[0];
  return {
    boardLength: best?.boardLength ?? candidate.piece.length,
    boardWidth:
      best?.boardWidth ?? Math.max(candidate.piece.width, requiredWidth),
    panelLength: requiredLength,
    panelWidth: requiredWidth,
  };
}

function lumberShape(
  requirement: MatchRequirement,
  candidate: InventoryMatch,
): PreviewShape {
  return {
    boardLength: candidate.piece.length,
    boardWidth: LUMBER_PREVIEW_WIDTH,
    panelLength: requirement.length,
    panelWidth: LUMBER_PREVIEW_WIDTH,
  };
}

export default function CandidatePreview({
  requirement,
  candidate,
}: {
  requirement: MatchRequirement;
  candidate: InventoryMatch;
}) {
  const shape =
    requirement.materialType === 'lumber'
      ? lumberShape(requirement, candidate)
      : phenolicShape(requirement, candidate);

  // Lay portrait stock on its side so the preview stays compact.
  const transposed = shape.boardWidth > shape.boardLength;
  const displayWidth = transposed ? shape.boardWidth : shape.boardLength;
  const displayHeight = transposed ? shape.boardLength : shape.boardWidth;
  const panelWidth = transposed ? shape.panelWidth : shape.panelLength;
  const panelHeight = transposed ? shape.panelLength : shape.panelWidth;
  const viewBox = [
    -PADDING,
    -PADDING,
    displayWidth + PADDING * 2,
    displayHeight + PADDING * 2,
  ].join(' ');
  const trimRight = Math.max(0, displayWidth - panelWidth);
  const trimBottom = Math.max(0, displayHeight - panelHeight);
  const dimensions =
    requirement.materialType === 'lumber'
      ? `${formatMeters(candidate.piece.length)} · ${candidate.piece.crossSection ?? '—'}`
      : `${formatMeters(candidate.piece.length)} × ${formatMeters(candidate.piece.width)}`;

  return (
    <div
      data-testid="planner-candidate-preview"
      className="space-y-2 rounded-md border border-dashed border-primary/60 bg-primary/5 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Candidate preview</p>
        <Badge variant="outline">Not accepted</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {requirement.label} on piece{' '}
        <span className="font-mono">{shortId(candidate.piece.id)}</span> ·{' '}
        {dimensions}
      </p>

      <svg
        data-testid="candidate-preview-diagram"
        viewBox={viewBox}
        role="img"
        aria-label={`Preview of ${requirement.label} on piece ${shortId(candidate.piece.id)}`}
        className="w-full rounded-md border border-dashed bg-white"
      >
        <defs>
          <pattern
            id="candidate-trim-hatch"
            width="0.08"
            height="0.08"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="0.08" height="0.08" fill="#fef3c7" />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="0.08"
              stroke="#d97706"
              strokeWidth="0.018"
            />
          </pattern>
        </defs>

        <rect
          x={0}
          y={0}
          width={displayWidth}
          height={displayHeight}
          fill="#ffffff"
          stroke="#111827"
          strokeWidth={0.012}
        />

        {candidate.requiresCutting && (
          <g data-testid="candidate-preview-trim" fill="url(#candidate-trim-hatch)">
            {trimRight > 0 && (
              <rect
                x={panelWidth}
                y={0}
                width={trimRight}
                height={displayHeight}
              />
            )}
            {trimBottom > 0 && (
              <rect
                x={0}
                y={panelHeight}
                width={panelWidth}
                height={trimBottom}
              />
            )}
          </g>
        )}

        <rect
          data-testid="candidate-preview-panel"
          data-ghost="true"
          x={0}
          y={0}
          width={panelWidth}
          height={panelHeight}
          fill="#3b82f6"
          fillOpacity={0.14}
          stroke="#2563eb"
          strokeWidth={0.012}
          strokeDasharray="0.05 0.03"
        />
      </svg>

      <p className="text-xs text-muted-foreground">
        {candidate.requiresCutting
          ? 'Shaded area is trim; nothing changes until you accept this candidate.'
          : 'Exact fit; nothing changes until you accept this candidate.'}
      </p>
    </div>
  );
}
