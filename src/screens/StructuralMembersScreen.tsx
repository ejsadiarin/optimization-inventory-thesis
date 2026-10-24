import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  onOpenChange: (open: boolean) => void;
  onSubmit: (fields: { label: string; length: number; crossSection: CrossSection }) => Promise<void>;
}

function LumberDialog({ onOpenChange, onSubmit }: LumberDialogProps) {
  const [label, setLabel] = useState('');
  const [length, setLength] = useState('');
  const [crossSection, setCrossSection] = useState<CrossSection>('2x2');
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
          <DialogTitle>Add lumber requirement</DialogTitle>
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
  const [members, setMembers] = useState<StructuralMember[]>([]);
  const [lumberRequirements, setLumberRequirements] = useState<LumberRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberDialog, setMemberDialog] = useState<{
    open: boolean;
    member: StructuralMember | null;
  }>({ open: false, member: null });
  const [lumberDialogOpen, setLumberDialogOpen] = useState(false);

  async function refresh() {
    const [nextMembers, nextLumber] = await Promise.all([
      listStructuralMembers(project.id),
      listLumberRequirements(project.id),
    ]);
    setMembers(nextMembers);
    setLumberRequirements(nextLumber);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

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

  async function handleMemberDelete(member: StructuralMember) {
    await deleteStructuralMember(project.id, member.id);
    await refresh();
  }

  async function handleLumberSubmit(fields: {
    label: string;
    length: number;
    crossSection: CrossSection;
  }) {
    await createLumberRequirement({ projectId: project.id, ...fields });
    setLumberDialogOpen(false);
    await refresh();
  }

  async function handleLumberDelete(requirement: LumberRequirement) {
    await deleteLumberRequirement(project.id, requirement.id);
    await refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Structural members</h1>
        <p className="text-sm text-muted-foreground">
          Define columns, beams, and slabs to derive their formwork panels.
        </p>
      </div>

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
          <Button size="sm" onClick={() => setMemberDialog({ open: true, member: null })}>
            <Plus className="h-4 w-4" />
            Add member
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading members…</p>
          ) : memberRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No structural members yet.</p>
          ) : (
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
                      {formatMeters(member.length)} × {formatMeters(member.width)}
                      {member.type !== 'slab' && <> × {formatMeters(member.height)}</>}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{panels.length} panels</span>
                      <span className="block text-xs text-muted-foreground">
                        {summarizePanels(panels)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit ${member.label}`}
                          onClick={() => setMemberDialog({ open: true, member })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete ${member.label}`}
                          onClick={() => void handleMemberDelete(member)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
          <Button size="sm" onClick={() => setLumberDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Add lumber
          </Button>
        </CardHeader>
        <CardContent>
          {lumberGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lumber requirements yet.</p>
          ) : (
            <div className="space-y-5">
              {lumberGroups.map((group) => (
                <div key={group.crossSection} className="space-y-2">
                  <h3 className="text-sm font-semibold">
                    {crossSectionLabel(group.crossSection)} lumber
                  </h3>
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
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Delete lumber ${requirement.label}`}
                              onClick={() => void handleLumberDelete(requirement)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {memberDialog.open && (
        <MemberDialog
          member={memberDialog.member}
          onOpenChange={(open) => {
            if (!open) setMemberDialog({ open: false, member: null });
          }}
          onSubmit={handleMemberSubmit}
        />
      )}

      {lumberDialogOpen && (
        <LumberDialog
          onOpenChange={setLumberDialogOpen}
          onSubmit={handleLumberSubmit}
        />
      )}
    </div>
  );
}
