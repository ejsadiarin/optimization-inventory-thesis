import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  AlertTriangle,
  Boxes,
  Pencil,
  Plus,
  Ruler,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  LUMBER_CROSS_SECTIONS,
  createLumberRequirement,
  createStructuralMember,
  deleteLumberRequirement,
  deleteStructuralMember,
  groupLumberRequirementsByCrossSection,
  listLumberRequirements,
  listStructuralMembers,
  updateLumberRequirement,
  updateStructuralMember,
  type StructuralMemberFields,
} from '@/db/members';
import type {
  CrossSection,
  LumberRequirement,
  Project,
  StructuralMember,
  StructuralMemberType,
} from '@/db/types';
import { decomposeMember, panelsExceedingStock } from '@/engine/decompose';
import type { PanelRequirement } from '@/engine/types';
import { crossSectionLabel, formatMeters } from '@/lib/format';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useRefreshSignal } from '@/lib/useRefreshSignal';

const MEMBER_TYPE_LABELS: Record<StructuralMemberType, string> = {
  column: 'Column',
  beam: 'Beam',
  slab: 'Slab',
};

function summarizePanels(panels: PanelRequirement[]): string {
  const counts = new Map<string, number>();

  for (const panel of panels) {
    const dimension = `${formatMeters(panel.length)} × ${formatMeters(panel.width)}`;
    counts.set(dimension, (counts.get(dimension) ?? 0) + 1);
  }

  return Array.from(counts, ([dimension, count]) =>
    count > 1 ? `${dimension} ×${count}` : dimension,
  ).join(', ');
}

function toPositiveNumber(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatMemberDimensions(member: StructuralMember): string {
  const dimensions =
    member.type === 'slab'
      ? [member.length, member.width]
      : [member.length, member.width, member.height];
  return dimensions.map(formatMeters).join(' × ');
}

function PanelsSummary({ panels }: { panels: PanelRequirement[] }) {
  return (
    <>
      <span className="font-medium">{panels.length} panels</span>
      <span className="block text-xs text-muted-foreground">{summarizePanels(panels)}</span>
    </>
  );
}

interface MemberActionsProps {
  member: StructuralMember;
  onEdit: () => void;
  onDelete: () => void;
}

function MemberActions({ member, onEdit, onDelete }: MemberActionsProps) {
  return (
    <div className="flex gap-1">
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Edit ${member.label}`}
        onClick={onEdit}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Delete ${member.label}`}
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface LumberActionsProps {
  requirement: LumberRequirement;
  onEdit: () => void;
  onDelete: () => void;
}

function LumberActions({ requirement, onEdit, onDelete }: LumberActionsProps) {
  return (
    <div className="flex gap-1">
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Edit lumber ${requirement.label}`}
        onClick={onEdit}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Delete lumber ${requirement.label}`}
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface MemberDialogProps {
  member: StructuralMember | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (fields: StructuralMemberFields) => Promise<void>;
}

function MemberDialog({ member, onOpenChange, onSubmit }: MemberDialogProps) {
  const [type, setType] = useState<StructuralMemberType>(member?.type ?? 'column');
  const [label, setLabel] = useState(member?.label ?? '');
  const [length, setLength] = useState(member ? String(member.length) : '');
  const [width, setWidth] = useState(member ? String(member.width) : '');
  const [height, setHeight] = useState(member ? String(member.height) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedLength = toPositiveNumber(length);
    const parsedWidth = toPositiveNumber(width);
    const parsedHeight = type === 'slab' ? 0 : toPositiveNumber(height);

    if (!label.trim()) {
      setError('Member label is required.');
      return;
    }
    if (parsedLength === null || parsedWidth === null || parsedHeight === null) {
      setError('Length, width, and height must be greater than zero.');
      return;
    }

    setSaving(true);
    await onSubmit({
      type,
      label: label.trim(),
      length: parsedLength,
      width: parsedWidth,
      height: parsedHeight,
    });
    setSaving(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{member ? 'Edit member' : 'Add member'}</DialogTitle>
          <DialogDescription>
            Dimensions are in meters. Slabs only need length and width.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="member-type">Member type</Label>
              <Select
                value={type}
                onValueChange={(value) => {
                  setType(value as StructuralMemberType);
                  if (error) setError('');
                }}
              >
                <SelectTrigger id="member-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MEMBER_TYPE_LABELS) as StructuralMemberType[]).map((value) => (
                    <SelectItem key={value} value={value}>
                      {MEMBER_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-label">Member label</Label>
              <Input
                id="member-label"
                value={label}
                placeholder="e.g. C1"
                onChange={(event) => {
                  setLabel(event.target.value);
                  if (error) setError('');
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-length">Length (m)</Label>
              <Input
                id="member-length"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={length}
                onChange={(event) => {
                  setLength(event.target.value);
                  if (error) setError('');
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-width">Width (m)</Label>
              <Input
                id="member-width"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={width}
                onChange={(event) => {
                  setWidth(event.target.value);
                  if (error) setError('');
                }}
              />
            </div>
            {type !== 'slab' && (
              <div className="space-y-2">
                <Label htmlFor="member-height">Height (m)</Label>
                <Input
                  id="member-height"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={height}
                  onChange={(event) => {
                    setHeight(event.target.value);
                    if (error) setError('');
                  }}
                />
              </div>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              Save member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface LumberDialogProps {
  requirement?: LumberRequirement | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (fields: { label: string; length: number; crossSection: CrossSection }) => Promise<void>;
}

function LumberDialog({ requirement = null, onOpenChange, onSubmit }: LumberDialogProps) {
  const [label, setLabel] = useState(requirement?.label ?? '');
  const [length, setLength] = useState(requirement ? String(requirement.length) : '');
  const [crossSection, setCrossSection] = useState<CrossSection>(requirement?.crossSection ?? '2x2');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedLength = toPositiveNumber(length);
    if (!label.trim()) {
      setError('Requirement label is required.');
      return;
    }
    if (parsedLength === null) {
      setError('Length must be greater than zero.');
      return;
    }

    setSaving(true);
    await onSubmit({ label: label.trim(), length: parsedLength, crossSection });
    setSaving(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{requirement ? 'Edit lumber requirement' : 'Add lumber requirement'}</DialogTitle>
          <DialogDescription>
            Lumber cuts are entered manually and grouped by cross-section.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="lumber-label">Requirement label</Label>
            <Input
              id="lumber-label"
              value={label}
              placeholder="e.g. Column brace"
              onChange={(event) => {
                setLabel(event.target.value);
                if (error) setError('');
              }}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lumber-length">Length (m)</Label>
              <Input
                id="lumber-length"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={length}
                onChange={(event) => {
                  setLength(event.target.value);
                  if (error) setError('');
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lumber-cross-section">Cross-section</Label>
              <Select
                value={crossSection}
                onValueChange={(value) => {
                  setCrossSection(value as CrossSection);
                  if (error) setError('');
                }}
              >
                <SelectTrigger id="lumber-cross-section">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LUMBER_CROSS_SECTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {crossSectionLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              Save requirement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function StructuralMembersScreen() {
  const project = useOutletContext<Project>();
  const refreshSignal = useRefreshSignal();
  const isDesktop = useIsDesktop();
  const [members, setMembers] = useState<StructuralMember[]>([]);
  const [lumberRequirements, setLumberRequirements] = useState<LumberRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [memberPendingDelete, setMemberPendingDelete] = useState<StructuralMember | null>(
    null,
  );
  const [deletingMember, setDeletingMember] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [memberDialog, setMemberDialog] = useState<{
    open: boolean;
    member: StructuralMember | null;
  }>({ open: false, member: null });
  const [lumberDialog, setLumberDialog] = useState<{
    open: boolean;
    requirement: LumberRequirement | null;
  }>({ open: false, requirement: null });

  const refresh = useCallback(async () => {
    try {
      const [nextMembers, nextLumber] = await Promise.all([
        listStructuralMembers(project.id),
        listLumberRequirements(project.id),
      ]);
      setMembers(nextMembers);
      setLumberRequirements(nextLumber);
      setLoadError('');
    } catch {
      setLoadError('Could not load structural members or lumber requirements. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshSignal]);

  const memberRows = useMemo(
    () => members.map((member) => ({ member, panels: decomposeMember(member) })),
    [members],
  );

  const oversizedPanels = useMemo(() => {
    const panels = memberRows.flatMap((row) => row.panels);
    return panelsExceedingStock(panels, project.stock.phenolic);
  }, [memberRows, project.stock.phenolic]);

  const lumberGroups = groupLumberRequirementsByCrossSection(lumberRequirements);

  async function handleMemberSubmit(fields: StructuralMemberFields) {
    if (memberDialog.member) {
      await updateStructuralMember(project.id, memberDialog.member.id, fields);
    } else {
      await createStructuralMember({ projectId: project.id, ...fields });
    }
    setMemberDialog({ open: false, member: null });
    await refresh();
  }

  function requestMemberDelete(member: StructuralMember) {
    setDeleteError('');
    setMemberPendingDelete(member);
  }

  async function confirmMemberDelete() {
    if (!memberPendingDelete) return;
    setDeletingMember(true);
    setDeleteError('');
    try {
      await deleteStructuralMember(project.id, memberPendingDelete.id);
      setMemberPendingDelete(null);
      await refresh();
    } catch {
      setDeleteError('Could not delete this member. Try again.');
    } finally {
      setDeletingMember(false);
    }
  }

  async function handleLumberSubmit(fields: {
    label: string;
    length: number;
    crossSection: CrossSection;
  }) {
    if (lumberDialog.requirement) {
      await updateLumberRequirement(project.id, lumberDialog.requirement.id, fields);
    } else {
      await createLumberRequirement({ projectId: project.id, ...fields });
    }
    setLumberDialog({ open: false, requirement: null });
    await refresh();
  }

  async function handleLumberDelete(requirement: LumberRequirement) {
    await deleteLumberRequirement(project.id, requirement.id);
    await refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Structural members"
        description="Define columns, beams, and slabs to derive their formwork panels."
      />

      {loadError ? (
        <ErrorState
          message={loadError}
          onRetry={() => {
            setLoadError('');
            setLoading(true);
            void refresh();
          }}
        />
      ) : (
        <>
          {oversizedPanels.length > 0 && (
            <div
              role="alert"
              className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="space-y-1">
                <p className="font-medium text-destructive">
                  {oversizedPanels.length} panel{oversizedPanels.length === 1 ? '' : 's'} exceed the
                  stock sheet — manual tiling is required.
                </p>
                <p className="text-muted-foreground">
                  {oversizedPanels
                    .map(
                      (panel) =>
                        `${panel.label} (${formatMeters(panel.length)} × ${formatMeters(panel.width)})`,
                    )
                    .join(', ')}
                </p>
              </div>
            </div>
          )}

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
              <div className="space-y-1.5">
                <CardTitle className="text-base">Members</CardTitle>
                <CardDescription>
                  Column → 4 panels · Beam → 3 panels · Slab → 1 panel
                </CardDescription>
              </div>
              {memberRows.length > 0 && (
                <Button
                  size="sm"
                  onClick={() => setMemberDialog({ open: true, member: null })}
                >
                  <Plus className="h-4 w-4" />
                  Add member
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading members…</p>
              ) : memberRows.length === 0 ? (
                <EmptyState
                  icon={Boxes}
                  title="No structural members yet"
                  description="Add a column, beam, or slab to derive its formwork panels."
                  className="border-0 bg-transparent px-0 py-6"
                  action={
                    <Button
                      type="button"
                      onClick={() => setMemberDialog({ open: true, member: null })}
                    >
                      <Plus className="h-4 w-4" />
                      Add member
                    </Button>
                  }
                />
              ) : isDesktop ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Dimensions</TableHead>
                      <TableHead>Panels</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {memberRows.map(({ member, panels }) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.label}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{MEMBER_TYPE_LABELS[member.type]}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatMemberDimensions(member)}
                        </TableCell>
                        <TableCell>
                          <PanelsSummary panels={panels} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end">
                            <MemberActions
                              member={member}
                              onEdit={() => setMemberDialog({ open: true, member })}
                              onDelete={() => requestMemberDelete(member)}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <ul data-testid="member-cards" className="space-y-2">
                  {memberRows.map(({ member, panels }) => (
                    <li key={member.id} className="rounded-lg border bg-card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{member.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatMemberDimensions(member)}
                          </p>
                        </div>
                        <Badge variant="secondary">{MEMBER_TYPE_LABELS[member.type]}</Badge>
                      </div>
                      <p className="mt-2 text-sm">
                        <PanelsSummary panels={panels} />
                      </p>
                      <div className="mt-2">
                        <MemberActions
                          member={member}
                          onEdit={() => setMemberDialog({ open: true, member })}
                          onDelete={() => requestMemberDelete(member)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
              <div className="space-y-1.5">
                <CardTitle className="text-base">Lumber requirements</CardTitle>
                <CardDescription>
                  Add bracing and support cuts. Requirements are grouped by cross-section.
                </CardDescription>
              </div>
              {lumberGroups.length > 0 && (
                <Button size="sm" onClick={() => setLumberDialog({ open: true, requirement: null })}>
                  <Plus className="h-4 w-4" />
                  Add lumber
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading lumber requirements…</p>
              ) : lumberGroups.length === 0 ? (
                <EmptyState
                  icon={Ruler}
                  title="No lumber requirements yet"
                  description="Add bracing and support cuts. Requirements are grouped by cross-section."
                  className="border-0 bg-transparent px-0 py-6"
                  action={
                    <Button
                      type="button"
                      onClick={() => setLumberDialog({ open: true, requirement: null })}
                    >
                      <Plus className="h-4 w-4" />
                      Add lumber
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-5">
                  {lumberGroups.map((group) => (
                    <div key={group.crossSection} className="space-y-2">
                      <h3 className="text-sm font-semibold">
                        {crossSectionLabel(group.crossSection)} lumber
                      </h3>
                      {isDesktop ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Label</TableHead>
                              <TableHead>Length</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.items.map((requirement) => (
                              <TableRow key={requirement.id}>
                                <TableCell className="font-medium">{requirement.label}</TableCell>
                                <TableCell>{formatMeters(requirement.length)}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end">
                                    <LumberActions
                                      requirement={requirement}
                                      onEdit={() =>
                                        setLumberDialog({ open: true, requirement })
                                      }
                                      onDelete={() => void handleLumberDelete(requirement)}
                                    />
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <ul
                          data-testid={`lumber-cards-${group.crossSection}`}
                          className="space-y-2"
                        >
                          {group.items.map((requirement) => (
                            <li
                              key={requirement.id}
                              className="rounded-lg border bg-card p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-medium">{requirement.label}</p>
                                <p className="text-sm text-muted-foreground">
                                  {formatMeters(requirement.length)}
                                </p>
                              </div>
                              <div className="mt-2">
                                <LumberActions
                                  requirement={requirement}
                                  onEdit={() =>
                                    setLumberDialog({ open: true, requirement })
                                  }
                                  onDelete={() => void handleLumberDelete(requirement)}
                                />
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {memberPendingDelete && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !deletingMember) setMemberPendingDelete(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {memberPendingDelete.label}?</DialogTitle>
              <DialogDescription>
                This removes the member and its derived panels from this project. This
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {deleteError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {deleteError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={deletingMember}
                onClick={() => setMemberPendingDelete(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deletingMember}
                onClick={() => void confirmMemberDelete()}
              >
                Delete member
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {memberDialog.open && (
        <MemberDialog
          member={memberDialog.member}
          onOpenChange={(open) => {
            if (!open) setMemberDialog({ open: false, member: null });
          }}
          onSubmit={handleMemberSubmit}
        />
      )}

      {lumberDialog.open && (
        <LumberDialog
          requirement={lumberDialog.requirement}
          onOpenChange={(open) => {
            if (!open) setLumberDialog({ open: false, requirement: null });
          }}
          onSubmit={handleLumberSubmit}
        />
      )}
    </div>
  );
}
