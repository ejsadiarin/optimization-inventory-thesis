import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { INSPECTION_USAGE_THRESHOLD } from '@/db/types';
import type { InventoryMatch, MatchGroup } from '@/engine/types';
import { conditionBadgeClass, materialTypeLabel, shortId } from '@/lib/format';
import { candidateDimensions, requirementDimensions } from './matchLabels';
import {
  REUSE_STATUS_LABELS,
  type RequirementReview,
  type ReuseStatus,
} from './reuseReview';

const STATUS_ORDER: ReuseStatus[] = [
  'needsDecision',
  'satisfied',
  'newStock',
  'noMatch',
];

export interface RequirementRowsProps {
  reviews: readonly RequirementReview[];
  lockedRequirementIds?: ReadonlySet<string>;
  onAccept: (group: MatchGroup, candidate: InventoryMatch) => void;
  onDecline: (group: MatchGroup, candidate: InventoryMatch) => void;
  onRestoreDeclined: (group: MatchGroup, candidate: InventoryMatch) => void;
  onResetRequirement: (group: MatchGroup) => void;
  onRelease?: (group: MatchGroup) => void;
}

export default function RequirementRows({
  reviews,
  lockedRequirementIds,
  onAccept,
  onDecline,
  onRestoreDeclined,
  onResetRequirement,
  onRelease,
}: RequirementRowsProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const sections = useMemo(() => {
    const byStatus = new Map<ReuseStatus, RequirementReview[]>();
    for (const status of STATUS_ORDER) byStatus.set(status, []);
    for (const review of reviews) byStatus.get(review.status)?.push(review);
    return STATUS_ORDER.map((status) => ({
      status,
      reviews: byStatus.get(status) ?? [],
    })).filter((section) => section.reviews.length > 0);
  }, [reviews]);

  function toggle(requirementId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(requirementId)) next.delete(requirementId);
      else next.add(requirementId);
      return next;
    });
  }

  return (
    <div
      data-testid="planner-requirement-list"
      className="space-y-4 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto lg:pr-1"
    >
      {sections.map((section) => (
        <section
          key={section.status}
          aria-label={REUSE_STATUS_LABELS[section.status]}
          className="space-y-1.5"
        >
          <div className="sticky top-0 z-10 flex items-center gap-2 bg-background/95 py-1 backdrop-blur">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {REUSE_STATUS_LABELS[section.status]}
            </h2>
            <span className="text-xs text-muted-foreground">
              {section.reviews.length}
            </span>
          </div>
          <div className="divide-y rounded-lg border bg-background">
            {section.reviews.map((review) => (
              <RequirementRow
                key={review.group.requirement.id}
                review={review}
                expanded={expanded.has(review.group.requirement.id)}
                locked={
                  lockedRequirementIds?.has(review.group.requirement.id) ?? false
                }
                onToggle={() => toggle(review.group.requirement.id)}
                onAccept={onAccept}
                onDecline={onDecline}
                onRestoreDeclined={onRestoreDeclined}
                onResetRequirement={onResetRequirement}
                onRelease={onRelease}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function RequirementRow({
  review,
  expanded,
  locked,
  onToggle,
  onAccept,
  onDecline,
  onRestoreDeclined,
  onResetRequirement,
  onRelease,
}: {
  review: RequirementReview;
  expanded: boolean;
  locked: boolean;
  onToggle: () => void;
  onAccept: RequirementRowsProps['onAccept'];
  onDecline: RequirementRowsProps['onDecline'];
  onRestoreDeclined: RequirementRowsProps['onRestoreDeclined'];
  onResetRequirement: RequirementRowsProps['onResetRequirement'];
  onRelease?: RequirementRowsProps['onRelease'];
}) {
  const { group, status } = review;
  const requirement = group.requirement;
  const topCandidate = review.availableCandidates[0];
  const otherCandidates = review.availableCandidates.slice(1);
  const expandableCount =
    otherCandidates.length + review.declinedCandidates.length;
  const canReset =
    status === 'satisfied' || review.declinedCandidates.length > 0;

  return (
    <article
      data-testid={`requirement-row-${requirement.id}`}
      className="px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {requirement.label}
            {requirement.panelIndex !== undefined &&
              requirement.panelCount !== undefined && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  Panel {requirement.panelIndex} of {requirement.panelCount}
                </span>
              )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {requirementDimensions(requirement)} ·{' '}
            {materialTypeLabel(requirement.materialType)}
          </p>
        </div>

        <StatusBadge review={review} />
        {review.acceptedPieceId && (
          <Badge variant="outline">
            Piece {shortId(review.acceptedPieceId)}
          </Badge>
        )}
        {locked && (
          <Badge variant="outline">
            <Lock className="mr-1 h-3 w-3" /> Locked
          </Badge>
        )}
        {status === 'satisfied' && locked && onRelease && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`Release ${requirement.label}`}
            onClick={() => onRelease(group)}
          >
            Release
          </Button>
        )}
        {canReset && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`Reset decisions for ${requirement.label}`}
            onClick={() => onResetRequirement(group)}
          >
            Reset
          </Button>
        )}
      </div>

      {status === 'satisfied' ? (
        <p className="mt-0.5 text-xs text-emerald-700">Excluded from cutting.</p>
      ) : topCandidate ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5">
          <span className="font-mono text-xs font-semibold">
            {shortId(topCandidate.piece.id)}
          </span>
          <span className="text-xs text-muted-foreground">
            {candidateDimensions(topCandidate.piece)}
          </span>
          {topCandidate.piece.storageLocation && (
            <span className="text-xs text-muted-foreground">
              {topCandidate.piece.storageLocation}
            </span>
          )}
          <Badge className={conditionBadgeClass(topCandidate.piece.condition)}>
            {topCandidate.piece.condition}
          </Badge>
          <Badge variant="secondary">
            Usage {topCandidate.piece.usageCount ?? 0}
          </Badge>
          {topCandidate.requiresCutting && (
            <Badge className="border-amber-600/30 bg-amber-50 text-amber-700">
              <AlertTriangle className="mr-1 h-3 w-3" /> Requires cutting
            </Badge>
          )}
          {(topCandidate.piece.usageCount ?? 0) + 1 ===
            INSPECTION_USAGE_THRESHOLD && (
            <Badge className="border-amber-600/30 bg-amber-50 text-amber-700">
              <AlertTriangle className="mr-1 h-3 w-3" /> Inspection after this use
            </Badge>
          )}
          {review.sharedPieceCandidateIds.includes(topCandidate.pieceId) && (
            <span className="text-xs text-muted-foreground">
              shares piece · remaining space fits
            </span>
          )}
          <div className="ml-auto flex gap-1">
            <Button
              type="button"
              size="sm"
              aria-label={`Accept ${shortId(topCandidate.piece.id)} for ${requirement.label}`}
              onClick={() => onAccept(group, topCandidate)}
            >
              Accept
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Decline ${shortId(topCandidate.piece.id)} for ${requirement.label}`}
              onClick={() => onDecline(group, topCandidate)}
            >
              Decline
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {emptyCandidateMessage(review)}
        </p>
      )}

      {review.assignedElsewhereCount > 0 && status !== 'satisfied' && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {review.assignedElsewhereCount} matching piece
          {review.assignedElsewhereCount === 1 ? '' : 's'} assigned to other
          requirements.
        </p>
      )}

      {expandableCount > 0 && (
        <div className="mt-1">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Hide' : 'Show'} other candidates for ${requirement.label}`}
            onClick={onToggle}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {expanded ? 'Hide' : 'Show'} {expandableCount} more
            {review.declinedCandidates.length > 0 &&
              ` (${review.declinedCandidates.length} declined)`}
          </button>

          {expanded && (
            <div className="mt-1.5 space-y-1 border-t pt-1.5">
              {otherCandidates.map((candidate) => (
                <CandidateLine
                  key={candidate.pieceId}
                  requirementLabel={requirement.label}
                  candidate={candidate}
                  shared={review.sharedPieceCandidateIds.includes(
                    candidate.pieceId,
                  )}
                  onAccept={() => onAccept(group, candidate)}
                  onDecline={() => onDecline(group, candidate)}
                />
              ))}
              {review.declinedCandidates.map((candidate) => (
                <div
                  key={candidate.pieceId}
                  className="flex flex-wrap items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
                >
                  <span className="font-mono">{shortId(candidate.piece.id)}</span>
                  <span>{candidateDimensions(candidate.piece)}</span>
                  <Badge variant="outline">Declined</Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7"
                    aria-label={`Restore ${shortId(candidate.piece.id)} for ${requirement.label}`}
                    onClick={() => onRestoreDeclined(group, candidate)}
                  >
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function CandidateLine({
  requirementLabel,
  candidate,
  shared,
  onAccept,
  onDecline,
}: {
  requirementLabel: string;
  candidate: InventoryMatch;
  shared: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-2 py-1 text-xs">
      <span className="font-mono">{shortId(candidate.piece.id)}</span>
      <span className="text-muted-foreground">
        {candidateDimensions(candidate.piece)}
      </span>
      {candidate.requiresCutting && (
        <Badge className="border-amber-600/30 bg-amber-50 text-amber-700">
          <AlertTriangle className="mr-1 h-3 w-3" /> Requires cutting
        </Badge>
      )}
      {shared && <span className="text-muted-foreground">shares piece</span>}
      <div className="ml-auto flex gap-1">
        <Button
          type="button"
          size="sm"
          className="h-7"
          aria-label={`Accept ${shortId(candidate.piece.id)} for ${requirementLabel}`}
          onClick={onAccept}
        >
          Accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7"
          aria-label={`Decline ${shortId(candidate.piece.id)} for ${requirementLabel}`}
          onClick={onDecline}
        >
          Decline
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ review }: { review: RequirementReview }) {
  const { status } = review;
  if (status === 'needsDecision') {
    return <Badge variant="outline">Needs decision</Badge>;
  }
  if (status === 'satisfied') {
    return (
      <Badge className="border-emerald-600/30 bg-emerald-50 text-emerald-700">
        <Check className="mr-1 h-3 w-3" /> Satisfied
      </Badge>
    );
  }
  if (status === 'newStock') {
    return <Badge variant="secondary">New stock</Badge>;
  }
  return <Badge variant="outline">No match</Badge>;
}

function emptyCandidateMessage(review: RequirementReview): string {
  if (review.group.candidates.length === 0) {
    return 'No active inventory pieces match. Will be cut from new stock.';
  }
  const declined = review.declinedCandidates.length;
  const assigned = review.assignedElsewhereCount;
  if (declined > 0 && assigned === 0) {
    return 'All matching pieces have been declined.';
  }
  if (assigned > 0 && declined === 0) {
    return 'All matching pieces are assigned to other requirements.';
  }
  return 'No pieces are available: some are declined and some are assigned elsewhere.';
}
