import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Loader2, PackageSearch } from 'lucide-react';
import CuttingPlans from '@/components/optimize/CuttingPlans';
import MatchGroups from '@/components/optimize/MatchGroups';
import { declinedKey } from '@/components/optimize/matchLabels';
import { buildMemberColorMap } from '@/components/optimize/memberColors';
import { offcutKey, type ReusableOffcutEntry } from '@/components/optimize/offcuts';
import { Card, CardContent } from '@/components/ui/card';
import { addPiece, getActivePieces, recordUsage } from '@/db/inventory';
import { listLumberRequirements, listStructuralMembers } from '@/db/members';
import {
  filterCuttingPlanSnapshot,
  getLatestCuttingPlan,
  saveCuttingPlanSnapshot,
} from '@/db/plans';
import type { Piece, Project } from '@/db/types';
import { optimizeProject } from '@/engine';
import { decomposeMember } from '@/engine/decompose';
import type {
  InventoryMatch,
  LumberRequirementInput,
  MatchGroup,
  MatchPiece,
  PanelRequirement,
} from '@/engine/types';
import { buildDatedFilename, downloadSvgAsFile, downloadSvgAsPng } from '@/lib/download';
import { toMatchPiece } from '@/lib/pieces';

const OFFCUT_THICKNESS = 0.012;

export default function OptimizationScreen() {
  const project = useOutletContext<Project>();
  const [panels, setPanels] = useState<PanelRequirement[]>([]);
  const [lumberInputs, setLumberInputs] = useState<LumberRequirementInput[]>([]);
  const [pieces, setPieces] = useState<MatchPiece[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [satisfiedRequirementIds, setSatisfiedRequirementIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [acceptedByRequirement, setAcceptedByRequirement] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [declinedCandidates, setDeclinedCandidates] = useState<Set<string>>(() => new Set());
  const [selectedOffcutKeys, setSelectedOffcutKeys] = useState<Set<string>>(() => new Set());
  const [addedOffcutKeys, setAddedOffcutKeys] = useState<Set<string>>(() => new Set());
  const [intakeMessage, setIntakeMessage] = useState('');
  const [intakeError, setIntakeError] = useState('');
  const [addingOffcuts, setAddingOffcuts] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [members, lumberRequirements, inventoryPieces, savedPlan] = await Promise.all([
      listStructuralMembers(project.id),
      listLumberRequirements(project.id),
      getActivePieces(project.id),
      getLatestCuttingPlan(project.id),
    ]);

    const panelRequirements = members.flatMap((member) => decomposeMember(member));
    const lumberRequirementInputs: LumberRequirementInput[] = lumberRequirements.map(
      (requirement) => ({
        id: requirement.id,
        label: requirement.label,
        length: requirement.length,
        crossSection: requirement.crossSection,
      }),
    );
    const matchPieces = inventoryPieces.map(toMatchPiece);
    const requirementIds = new Set([
      ...panelRequirements.map((panel) => panel.id),
      ...lumberRequirementInputs.map((requirement) => requirement.id),
    ]);
    const snapshot = savedPlan
      ? filterCuttingPlanSnapshot(savedPlan.snapshot, requirementIds)
      : { satisfiedRequirementIds: [], acceptedByRequirement: {} };

    setPanels(panelRequirements);
    setLumberInputs(lumberRequirementInputs);
    setPieces(matchPieces);
    setSatisfiedRequirementIds(new Set(snapshot.satisfiedRequirementIds));
    setAcceptedByRequirement(new Map(Object.entries(snapshot.acceptedByRequirement)));
    setLoading(false);
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const optimization = useMemo(
    () =>
      optimizeProject({
        panels,
        lumberRequirements: lumberInputs,
        stock: project.stock,
        costs: project.costs,
        pieces,
        satisfiedRequirementIds,
      }),
    [panels, lumberInputs, project.stock, project.costs, pieces, satisfiedRequirementIds],
  );

  const groups = optimization.matches;

  const memberColors = useMemo(
    () =>
      buildMemberColorMap(
        optimization.plywood.sheets.flatMap((sheet) =>
          sheet.panels.map((panel) => panel.label),
        ),
      ),
    [optimization.plywood.sheets],
  );

  const reusableOffcuts = useMemo<ReusableOffcutEntry[]>(
    () =>
      optimization.plywood.sheets.flatMap((sheet) =>
        sheet.offcuts
          .filter((offcut) => offcut.reusable)
          .map((offcut) => ({
            key: offcutKey(sheet.sheetIndex, offcut),
            sheetIndex: sheet.sheetIndex,
            offcut,
          })),
      ),
    [optimization.plywood.sheets],
  );

  async function handleAccept(group: MatchGroup, candidate: InventoryMatch) {
    setError('');
    if (satisfiedRequirementIds.has(group.requirement.id)) return;

    const assignedElsewhere = Array.from(acceptedByRequirement.entries()).some(
      ([requirementId, pieceId]) =>
        requirementId !== group.requirement.id && pieceId === candidate.pieceId,
    );
    if (assignedElsewhere) {
      setError('This piece is already assigned to another requirement.');
      return;
    }

    let updated: Piece;
    try {
      updated = await recordUsage(candidate.piece.id, project.id, group.requirement.label);
    } catch {
      setError('Could not record usage for this piece. It may have been retired.');
      return;
    }

    const nextSatisfied = new Set(satisfiedRequirementIds);
    nextSatisfied.add(group.requirement.id);
    const nextAccepted = new Map(acceptedByRequirement);
    nextAccepted.set(group.requirement.id, candidate.pieceId);

    setSatisfiedRequirementIds(nextSatisfied);
    setAcceptedByRequirement(nextAccepted);
    setPieces((current) =>
      current.map((piece) =>
        piece.id === candidate.pieceId
          ? {
              ...piece,
              usageCount: updated.usageCount,
              condition: updated.condition,
              retired: updated.retired,
            }
          : piece,
      ),
    );

    try {
      await saveCuttingPlanSnapshot(project.id, {
        satisfiedRequirementIds: Array.from(nextSatisfied),
        acceptedByRequirement: Object.fromEntries(nextAccepted),
      });
    } catch {
      setError('Could not save the accepted plan.');
    }
  }

  function handleDecline(group: MatchGroup, candidate: InventoryMatch) {
    setDeclinedCandidates((current) =>
      new Set(current).add(declinedKey(group.requirement.id, candidate.pieceId)),
    );
  }

  function toggleOffcut(key: string, checked: boolean) {
    setSelectedOffcutKeys((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  async function handleAddOffcuts() {
    const pending = reusableOffcuts.filter(
      (entry) => selectedOffcutKeys.has(entry.key) && !addedOffcutKeys.has(entry.key),
    );
    if (pending.length === 0) return;

    setAddingOffcuts(true);
    setIntakeError('');
    try {
      const dateAdded = new Date().toISOString();
      for (const entry of pending) {
        await addPiece({
          projectId: project.id,
          materialType: 'phenolic',
          length: entry.offcut.length,
          width: entry.offcut.width,
          thickness: OFFCUT_THICKNESS,
          condition: 'Good',
          dateAdded,
          source: 'Cut plan offcut',
        });
      }
      setAddedOffcutKeys((current) => new Set([...current, ...pending.map((entry) => entry.key)]));
      setSelectedOffcutKeys(new Set());
      setIntakeMessage(
        `Added ${pending.length} offcut${pending.length === 1 ? '' : 's'} to inventory.`,
      );
    } catch (caught) {
      setIntakeError(
        caught instanceof Error ? caught.message : 'Could not add offcuts to inventory.',
      );
    } finally {
      setAddingOffcuts(false);
    }
  }

  function exportSheet(sheetIndex: number) {
    const element = document.getElementById(`cut-plan-sheet-${sheetIndex}`);
    if (!element || element.tagName.toLowerCase() !== 'svg') {
      setError('Could not find the cutting plan sheet to export.');
      return;
    }
    downloadSvgAsFile(
      buildDatedFilename(project.name, `cut-plan-sheet-${sheetIndex + 1}`, 'svg'),
      element as unknown as SVGSVGElement,
    );
  }

  function exportSheetPng(sheetIndex: number) {
    const element = document.getElementById(`cut-plan-sheet-${sheetIndex}`);
    if (!element || element.tagName.toLowerCase() !== 'svg') {
      setError('Could not find the cutting plan sheet to export.');
      return;
    }
    void downloadSvgAsPng(
      buildDatedFilename(project.name, `cut-plan-sheet-${sheetIndex + 1}`, 'png'),
      element as unknown as SVGSVGElement,
    ).catch(() => {
      setError('Could not export the cutting plan image.');
    });
  }

  function exportAllSheets() {
    optimization.plywood.sheets.forEach((sheet) => exportSheet(sheet.sheetIndex));
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
                {optimization.remainingPanels.length +
                  optimization.remainingLumberRequirements.length}{' '}
                remaining for cutting
              </span>
            </CardContent>
          </Card>

          <MatchGroups
            groups={groups}
            satisfiedRequirementIds={satisfiedRequirementIds}
            acceptedByRequirement={acceptedByRequirement}
            declinedCandidates={declinedCandidates}
            onAccept={(group, candidate) => void handleAccept(group, candidate)}
            onDecline={handleDecline}
          />

          <CuttingPlans
            optimization={optimization}
            memberColors={memberColors}
            reusableOffcuts={reusableOffcuts}
            selectedOffcutKeys={selectedOffcutKeys}
            addedOffcutKeys={addedOffcutKeys}
            addingOffcuts={addingOffcuts}
            intakeMessage={intakeMessage}
            intakeError={intakeError}
            onToggleOffcut={toggleOffcut}
            onAddOffcuts={() => void handleAddOffcuts()}
            onExportSheet={exportSheet}
            onExportSheetPng={exportSheetPng}
            onExportAllSheets={exportAllSheets}
          />
        </>
      )}
    </div>
  );
}
