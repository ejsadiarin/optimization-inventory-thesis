import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { AlertTriangle, Check, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { INSPECTION_USAGE_THRESHOLD } from '@/db/types';
import type { InventoryMatch, MatchGroup } from '@/engine/types';
import { conditionBadgeClass, materialTypeLabel, shortId } from '@/lib/format';
import { candidateDimensions, requirementDimensions } from './matchLabels';
import {
  groupReviewsByMember,
  type RequirementReview,
  type ReviewSection,
} from './reuseReview';

const TOP_CANDIDATES = 3;

export interface MatchGroupsProps {
  reviews: readonly RequirementReview[];
  memberColors: ReadonlyMap<string, string>;
  lockedRequirementIds?: ReadonlySet<string>;
  onAccept: (group: MatchGroup, candidate: InventoryMatch) => void;
  onDecline: (group: MatchGroup, candidate: InventoryMatch) => void;
  onRestoreDeclined: (group: MatchGroup, candidate: InventoryMatch) => void;
  onResetRequirement: (group: MatchGroup) => void;
  onRelease?: (group: MatchGroup) => void;
}

export default function MatchGroups({
  reviews,
  memberColors,
  lockedRequirementIds,
  onAccept,
  onDecline,
  onRestoreDeclined,
  onResetRequirement,
  onRelease,
}: MatchGroupsProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [declinedOpen, setDeclinedOpen] = useState<ReadonlySet<string>>(() => new Set());
  const sections = useMemo(
    () => groupReviewsByMember(reviews, memberColors),
    [reviews, memberColors],
  );

  function toggle(
    setter: Dispatch<SetStateAction<ReadonlySet<string>>>,
    id: string,
  ) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <ReviewSectionView
          key={section.key}
          section={section}
          expanded={expanded}
          declinedOpen={declinedOpen}
          lockedRequirementIds={lockedRequirementIds}
          onToggleExpanded={(id) => toggle(setExpanded, id)}
          onToggleDeclined={(id) => toggle(setDeclinedOpen, id)}
          onAccept={onAccept}
          onDecline={onDecline}
          onRestoreDeclined={onRestoreDeclined}
          onResetRequirement={onResetRequirement}
          onRelease={onRelease}
        />
      ))}
    </div>
  );
}

interface ReviewSectionViewProps {
  section: ReviewSection;
  expanded: ReadonlySet<string>;
  declinedOpen: ReadonlySet<string>;
  lockedRequirementIds?: ReadonlySet<string>;
  onToggleExpanded: (requirementId: string) => void;
  onToggleDeclined: (requirementId: string) => void;
  onAccept: MatchGroupsProps['onAccept'];
  onDecline: MatchGroupsProps['onDecline'];
  onRestoreDeclined: MatchGroupsProps['onRestoreDeclined'];
  onResetRequirement: MatchGroupsProps['onResetRequirement'];
  onRelease?: MatchGroupsProps['onRelease'];
}

function ReviewSectionView({
  section,
  expanded,
  declinedOpen,
  lockedRequirementIds,
  onToggleExpanded,
  onToggleDeclined,
  onAccept,
  onDecline,
  onRestoreDeclined,
  onResetRequirement,
  onRelease,
}: ReviewSectionViewProps) {
  return (
    <section aria-label={section.title} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {section.color ? (
          <span
            aria-hidden="true"
            className="h-3 w-3 rounded-sm border border-black/10"
            style={{ backgroundColor: section.color }}
          />
        ) : null}
        <h2 className="text-sm font-semibold">{section.title}</h2>
        <span className="text-xs text-muted-foreground">
          {section.reviews.length} requirement{section.reviews.length === 1 ? '' : 's'}
        </span>
      </div>

      {section.reviews.map((review) => (
        <ReviewCard
          key={review.group.requirement.id}
          review={review}
          expanded={expanded.has(review.group.requirement.id)}
          declinedOpen={declinedOpen.has(review.group.requirement.id)}
          locked={lockedRequirementIds?.has(review.group.requirement.id) ?? false}
          onToggleExpanded={() => onToggleExpanded(review.group.requirement.id)}
          onToggleDeclined={() => onToggleDeclined(review.group.requirement.id)}
          onAccept={onAccept}
          onDecline={onDecline}
          onRestoreDeclined={onRestoreDeclined}
          onResetRequirement={onResetRequirement}
          onRelease={onRelease}
        />
      ))}
    </section>
  );
}

interface ReviewCardProps {
  review: RequirementReview;
  expanded: boolean;
  declinedOpen: boolean;
  locked: boolean;
  onToggleExpanded: () => void;
  onToggleDeclined: () => void;
  onAccept: MatchGroupsProps['onAccept'];
  onDecline: MatchGroupsProps['onDecline'];
  onRestoreDeclined: MatchGroupsProps['onRestoreDeclined'];
  onResetRequirement: MatchGroupsProps['onResetRequirement'];
  onRelease?: MatchGroupsProps['onRelease'];
}

function ReviewCard({
  review,
  expanded,
  declinedOpen,
  locked,
  onToggleExpanded,
  onToggleDeclined,
  onAccept,
  onDecline,
  onRestoreDeclined,
  onResetRequirement,
  onRelease,
}: ReviewCardProps) {
  const { group, status } = review;
  const requirement = group.requirement;
  const satisfied = status === 'satisfied';
  const newStock = status === 'newStock';
  const available = review.availableCandidates;
  const visible = expanded ? available : available.slice(0, TOP_CANDIDATES);
  const canReset = review.declinedCandidates.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex flex-wrap items-baseline gap-1.5 text-base">
              <span>{requirement.label}</span>
              {requirement.panelIndex !== undefined && requirement.panelCount !== undefined && (
                <span className="text-xs font-normal text-muted-foreground">
                  Panel {requirement.panelIndex} of {requirement.panelCount}
                </span>
              )}
            </CardTitle>
            <CardDescription>{requirementDimensions(requirement)}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{materialTypeLabel(requirement.materialType)}</Badge>
            {satisfied && (
              <Badge className="border-emerald-600/30 bg-emerald-50 text-emerald-700">
                <Check className="mr-1 h-3 w-3" /> Satisfied
              </Badge>
            )}
            {satisfied && locked && (
              <Badge variant="outline">
                <Lock className="mr-1 h-3 w-3" /> Locked
              </Badge>
            )}
            {newStock && <Badge variant="secondary">New stock</Badge>}
            {status === 'noMatch' && <Badge variant="outline">No match</Badge>}
            {review.acceptedPieceId && (
              <Badge variant="outline">Piece {shortId(review.acceptedPieceId)}</Badge>
            )}
            {satisfied && locked && onRelease && (
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
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {satisfied ? (
          <p className="text-sm font-medium text-emerald-700">Excluded from cutting.</p>
        ) : newStock ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              No inventory match. This requirement will be cut from new stock.
            </p>
            {review.assignedElsewhereCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {review.assignedElsewhereCount} matching piece
                {review.assignedElsewhereCount === 1 ? '' : 's'} assigned to other requirements.
              </p>
            )}
          </div>
        ) : (
          <>
            {visible.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {emptyCandidateMessage(review)}
              </p>
            ) : (
              <div className="space-y-2">
                {visible.map((candidate) => (
                  <CandidateRow
                    key={candidate.pieceId}
                    requirementLabel={requirement.label}
                    candidate={candidate}
                    sharedPiece={review.sharedPieceCandidateIds.includes(
                      candidate.pieceId,
                    )}
                    onAccept={() => onAccept(group, candidate)}
                    onDecline={() => onDecline(group, candidate)}
                  />
                ))}
              </div>
            )}

            {available.length > TOP_CANDIDATES && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={`${expanded ? 'Show fewer' : 'Show all'} ${available.length} candidates for ${requirement.label}`}
                onClick={onToggleExpanded}
              >
                {expanded ? 'Show fewer' : `Show all ${available.length}`}
              </Button>
            )}

            {review.assignedElsewhereCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {review.assignedElsewhereCount} matching piece
                {review.assignedElsewhereCount === 1 ? '' : 's'} assigned to other requirements.
              </p>
            )}
          </>
        )}

        {review.declinedCandidates.length > 0 && (
          <div className="space-y-2 border-t pt-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`${declinedOpen ? 'Hide' : 'Show'} declined candidates for ${requirement.label}`}
              onClick={onToggleDeclined}
            >
              {declinedOpen ? 'Hide declined' : `Show declined (${review.declinedCandidates.length})`}
            </Button>
            {declinedOpen && (
              <div className="space-y-2">
                {review.declinedCandidates.map((candidate) => (
                  <div
                    key={candidate.pieceId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed p-3 text-muted-foreground"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold">
                        {shortId(candidate.piece.id)}
                      </p>
                      <p className="text-sm">{candidateDimensions(candidate.piece)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Declined</Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={`Restore ${shortId(candidate.piece.id)} for ${requirement.label}`}
                        onClick={() => onRestoreDeclined(group, candidate)}
                      >
                        Restore
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function emptyCandidateMessage(review: RequirementReview): string {
  if (review.group.candidates.length === 0) {
    return 'No active inventory pieces match this requirement.';
  }
  const declined = review.declinedCandidates.length;
  const assigned = review.assignedElsewhereCount;
  if (declined > 0 && assigned === 0) {
    return 'All matching pieces have been declined.';
  }
  if (assigned > 0 && declined === 0) {
    return 'All matching pieces are assigned to other requirements.';
  }
  return 'No pieces are available: some are declined and some are assigned to other requirements.';
}

interface CandidateRowProps {
  requirementLabel: string;
  candidate: InventoryMatch;
  sharedPiece: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

function CandidateRow({
  requirementLabel,
  candidate,
  sharedPiece,
  onAccept,
  onDecline,
}: CandidateRowProps) {
  const usageCount = candidate.piece.usageCount ?? 0;
  const inspectionNext = usageCount + 1 === INSPECTION_USAGE_THRESHOLD;

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold">{shortId(candidate.piece.id)}</p>
          <p className="text-sm text-muted-foreground">{candidateDimensions(candidate.piece)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge className={conditionBadgeClass(candidate.piece.condition)}>
            {candidate.piece.condition}
          </Badge>
          <Badge variant="secondary">Usage {usageCount}</Badge>
          {candidate.requiresCutting && (
            <Badge className="border-amber-600/30 bg-amber-50 text-amber-700">
              <AlertTriangle className="mr-1 h-3 w-3" /> Requires cutting
            </Badge>
          )}
          {inspectionNext && (
            <Badge className="border-amber-600/30 bg-amber-50 text-amber-700">
              <AlertTriangle className="mr-1 h-3 w-3" /> Inspection after this use
            </Badge>
          )}
        </div>
      </div>

      {sharedPiece && (
        <p className="mt-2 text-xs text-muted-foreground">
          shares piece · remaining space fits
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          size="sm"
          aria-label={`Accept ${shortId(candidate.piece.id)} for ${requirementLabel}`}
          onClick={onAccept}
        >
          Accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Decline ${shortId(candidate.piece.id)} for ${requirementLabel}`}
          onClick={onDecline}
        >
          Decline
        </Button>
      </div>
    </div>
  );
}
