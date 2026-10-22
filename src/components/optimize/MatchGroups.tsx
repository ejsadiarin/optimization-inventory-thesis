import { AlertTriangle, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { InventoryMatch, MatchGroup } from '@/engine/types';
import { conditionBadgeClass, materialTypeLabel, shortId } from '@/lib/format';
import { candidateDimensions, declinedKey, requirementDimensions } from './matchLabels';

export interface MatchGroupsProps {
  groups: readonly MatchGroup[];
  satisfiedRequirementIds: ReadonlySet<string>;
  acceptedByRequirement: ReadonlyMap<string, string>;
  declinedCandidates: ReadonlySet<string>;
  onAccept: (group: MatchGroup, candidate: InventoryMatch) => void;
  onDecline: (group: MatchGroup, candidate: InventoryMatch) => void;
}

export default function MatchGroups({
  groups,
  satisfiedRequirementIds,
  acceptedByRequirement,
  declinedCandidates,
  onAccept,
  onDecline,
}: MatchGroupsProps) {
  return (
    <>
      {groups.map((group) => {
        const requirement = group.requirement;
        const satisfied = satisfiedRequirementIds.has(requirement.id);
        const acceptedPieceId = acceptedByRequirement.get(requirement.id);
        const assignedPieceIds = new Set(acceptedByRequirement.values());
        const visibleCandidates = group.candidates.filter((candidate) => {
          if (declinedCandidates.has(declinedKey(requirement.id, candidate.pieceId))) {
            return false;
          }
          if (acceptedPieceId) return candidate.pieceId === acceptedPieceId;
          return !assignedPieceIds.has(candidate.pieceId);
        });

        return (
          <Card key={requirement.id}>
            <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex flex-wrap items-baseline gap-1.5 text-base">
                      <span>{requirement.label}</span>
                      {requirement.panelIndex !== undefined &&
                        requirement.panelCount !== undefined && (
                          <span className="text-xs font-normal text-muted-foreground">
                            Panel {requirement.panelIndex} of {requirement.panelCount}
                          </span>
                        )}
                    </CardTitle>
                    <CardDescription>{requirementDimensions(requirement)}</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">{materialTypeLabel(requirement.materialType)}</Badge>
                  {satisfied && (
                    <Badge className="border-emerald-600/30 bg-emerald-50 text-emerald-700">
                      <Check className="mr-1 h-3 w-3" /> Satisfied
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {visibleCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active inventory pieces match this requirement.
                </p>
              ) : (
                visibleCandidates.map((candidate) => (
                  <div key={candidate.pieceId} className="rounded-md border bg-background p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold">
                          {shortId(candidate.piece.id)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {candidateDimensions(candidate.piece)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge className={conditionBadgeClass(candidate.piece.condition)}>
                          {candidate.piece.condition}
                        </Badge>
                        <Badge variant="secondary">Usage {candidate.piece.usageCount ?? 0}</Badge>
                        {candidate.requiresCutting && (
                          <Badge className="border-amber-600/30 bg-amber-50 text-amber-700">
                            <AlertTriangle className="mr-1 h-3 w-3" /> Requires cutting
                          </Badge>
                        )}
                      </div>
                    </div>

                    {!satisfied && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          aria-label={`Accept ${shortId(candidate.piece.id)} for ${requirement.label}`}
                          onClick={() => onAccept(group, candidate)}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Decline ${shortId(candidate.piece.id)} for ${requirement.label}`}
                          onClick={() => onDecline(group, candidate)}
                        >
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}

              {satisfied && (
                <p className="text-sm font-medium text-emerald-700">Excluded from cutting.</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
