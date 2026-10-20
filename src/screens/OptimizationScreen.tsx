import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AlertTriangle, Check, Loader2, PackageSearch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getActivePieces, recordUsage } from '@/db/inventory';
import { listLumberRequirements, listStructuralMembers } from '@/db/members';
import type { Piece, Project } from '@/db/types';
import { decomposeMember } from '@/engine/decompose';
import { matchInventory, remainingRequirements } from '@/engine/match';
import type {
  InventoryMatch,
  MatchGroup,
  MatchPiece,
  MatchRequirement,
} from '@/engine/types';
import {
  conditionBadgeClass,
  formatMeters,
  materialTypeLabel,
} from '@/lib/format';

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function crossSectionLabel(crossSection: string): string {
  return crossSection.replace('x', '×');
}

function toMatchPiece(piece: Piece): MatchPiece {
  return {
    id: piece.id,
    materialType: piece.materialType,
    length: piece.length,
    width: piece.width,
    crossSection: piece.crossSection,
    condition: piece.condition,
    retired: piece.retired,
    usageCount: piece.usageCount,
  };
}

function requirementDimensions(requirement: MatchRequirement): string {
  if (requirement.materialType === 'lumber') {
    return `${formatMeters(requirement.length)} · ${crossSectionLabel(requirement.crossSection ?? '—')}`;
  }
  return `${formatMeters(requirement.length)} × ${formatMeters(requirement.width ?? 0)}`;
}

function candidateDimensions(piece: MatchPiece): string {
  if (piece.materialType === 'lumber') {
    return `${formatMeters(piece.length)} · ${crossSectionLabel(piece.crossSection ?? '—')}`;
  }
  return `${formatMeters(piece.length)} × ${formatMeters(piece.width)}`;
}

function declinedKey(requirementId: string, pieceId: string): string {
  return `${requirementId}::${pieceId}`;
}

export default function OptimizationScreen() {
  const project = useOutletContext<Project>();
  const [groups, setGroups] = useState<MatchGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [satisfiedRequirementIds, setSatisfiedRequirementIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [acceptedByRequirement, setAcceptedByRequirement] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [declinedCandidates, setDeclinedCandidates] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const [members, lumberRequirements, pieces] = await Promise.all([
      listStructuralMembers(project.id),
      listLumberRequirements(project.id),
      getActivePieces(project.id),
    ]);

    const panelRequirements = members.flatMap((member) => decomposeMember(member));
    const requirements: MatchRequirement[] = [
      ...panelRequirements.map((panel) => ({
        id: panel.id,
        materialType: 'phenolic' as const,
        label: panel.label,
        length: panel.length,
        width: panel.width,
      })),
      ...lumberRequirements.map((requirement) => ({
        id: requirement.id,
        materialType: 'lumber' as const,
        label: requirement.label,
        length: requirement.length,
        crossSection: requirement.crossSection,
      })),
    ];

    setGroups(matchInventory(requirements, pieces.map(toMatchPiece)));
    setLoading(false);
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const remaining = remainingRequirements(groups, satisfiedRequirementIds);

  async function handleAccept(group: MatchGroup, candidate: InventoryMatch) {
    setError('');
    try {
      const updated = await recordUsage(
        candidate.piece.id,
        project.id,
        group.requirement.label,
      );

      setSatisfiedRequirementIds((current) => new Set(current).add(group.requirement.id));
      setAcceptedByRequirement((current) =>
        new Map(current).set(group.requirement.id, candidate.pieceId),
      );
      setGroups((current) =>
        current.map((item) => {
          if (item.requirement.id !== group.requirement.id) return item;
          return {
            ...item,
            candidates: item.candidates.map((entry) =>
              entry.pieceId === candidate.pieceId
                ? {
                    ...entry,
                    piece: {
                      ...entry.piece,
                      usageCount: updated.usageCount,
                      condition: updated.condition,
                      retired: updated.retired,
                    },
                  }
                : entry,
            ),
          };
        }),
      );
    } catch {
      setError('Could not record usage for this piece. It may have been retired.');
    }
  }

  function handleDecline(group: MatchGroup, candidate: InventoryMatch) {
    setDeclinedCandidates((current) =>
      new Set(current).add(declinedKey(group.requirement.id, candidate.pieceId)),
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Optimization</h1>
        <p className="text-sm text-muted-foreground">
          Review reusable inventory pieces before planning cuts on new stock.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading matches…
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <PackageSearch className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No formwork requirements yet</p>
            <p className="text-sm text-muted-foreground">
              Add structural members or lumber requirements to see reuse matches.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4 text-sm">
              <span className="font-medium">
                {satisfiedRequirementIds.size} of {groups.length} requirements satisfied
              </span>
              <span className="text-muted-foreground">
                {remaining.length} remaining for cutting
              </span>
            </CardContent>
          </Card>

          {groups.map((group) => {
            const requirement = group.requirement;
            const satisfied = satisfiedRequirementIds.has(requirement.id);
            const acceptedPieceId = acceptedByRequirement.get(requirement.id);
            const visibleCandidates = group.candidates.filter((candidate) => {
              if (declinedCandidates.has(declinedKey(requirement.id, candidate.pieceId))) {
                return false;
              }
              return !acceptedPieceId || candidate.pieceId === acceptedPieceId;
            });

            return (
              <Card key={requirement.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{requirement.label}</CardTitle>
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
                      <div
                        key={candidate.pieceId}
                        className="rounded-md border bg-background p-3"
                      >
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
                            <Badge variant="secondary">
                              Usage {candidate.piece.usageCount ?? 0}
                            </Badge>
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
                              onClick={() => void handleAccept(group, candidate)}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              aria-label={`Decline ${shortId(candidate.piece.id)} for ${requirement.label}`}
                              onClick={() => handleDecline(group, candidate)}
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
      )}
    </div>
  );
}
