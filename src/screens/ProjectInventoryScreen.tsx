import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, PackageOpen, Plus } from 'lucide-react';
import PieceDetailDialog from '@/components/inventory/PieceDetailDialog';
import PieceFormDialog from '@/components/inventory/PieceFormDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { daysInInventory, getActivePieces, queryPieces } from '@/db/inventory';
import type { PieceSortKey } from '@/db/inventory';
import type {
  MaterialType,
  Piece,
  PieceCondition,
  Project,
} from '@/db/types';
import {
  conditionBadgeClass,
  formatPieceDimensions,
  materialTypeLabel,
} from '@/lib/format';

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm';

const COLUMNS: { key: PieceSortKey; label: string }[] = [
  { key: 'id', label: 'ID' },
  { key: 'dimensions', label: 'Dimensions' },
  { key: 'materialType', label: 'Type' },
  { key: 'condition', label: 'Condition' },
  { key: 'usageCount', label: 'Usage' },
  { key: 'storageLocation', label: 'Location' },
  { key: 'dateAdded', label: 'Days in inventory' },
];

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function parseUsage(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export default function ProjectInventoryScreen() {
  const project = useOutletContext<Project>();
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<MaterialType | 'all'>('all');
  const [conditionFilter, setConditionFilter] = useState<PieceCondition | 'all'>('all');
  const [minUsage, setMinUsage] = useState('');
  const [maxUsage, setMaxUsage] = useState('');
  const [sortKey, setSortKey] = useState<PieceSortKey>('dateAdded');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const [formOpen, setFormOpen] = useState(false);
  const [editingPiece, setEditingPiece] = useState<Piece | null>(null);
  const [detailPiece, setDetailPiece] = useState<Piece | null>(null);

  const loadPieces = useCallback(async () => {
    setPieces(await getActivePieces(project.id));
    setLoading(false);
  }, [project.id]);

  useEffect(() => {
    void loadPieces();
  }, [loadPieces]);

  const visiblePieces = queryPieces(pieces, {
    search,
    materialType: typeFilter,
    condition: conditionFilter,
    minUsage: parseUsage(minUsage),
    maxUsage: parseUsage(maxUsage),
    sortKey,
    sortDirection,
  });

  function handleSort(key: PieceSortKey) {
    if (key === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection(key === 'dateAdded' ? 'desc' : 'asc');
  }

  function openAddForm() {
    setEditingPiece(null);
    setFormOpen(true);
  }

  function openEditForm(piece: Piece) {
    setDetailPiece(null);
    setEditingPiece(piece);
    setFormOpen(true);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Track every phenolic board and lumber piece across its lifecycle.
          </p>
        </div>
        <Button type="button" onClick={openAddForm}>
          <Plus className="h-4 w-4" /> Add piece
        </Button>
      </div>

      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="inventory-search">Search inventory</Label>
          <Input
            id="inventory-search"
            value={search}
            placeholder="Dimensions, type, or location"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-type">Filter by type</Label>
          <select
            id="filter-type"
            className={SELECT_CLASS}
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as MaterialType | 'all')}
          >
            <option value="all">All types</option>
            <option value="phenolic">Phenolic Board</option>
            <option value="lumber">Lumber</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-condition">Filter by condition</Label>
          <select
            id="filter-condition"
            className={SELECT_CLASS}
            value={conditionFilter}
            onChange={(event) =>
              setConditionFilter(event.target.value as PieceCondition | 'all')
            }
          >
            <option value="all">All conditions</option>
            <option value="Good">Good</option>
            <option value="For Inspection">For Inspection</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Usage range</Label>
          <div className="flex items-center gap-2">
            <Input
              aria-label="Minimum uses"
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="Min"
              value={minUsage}
              onChange={(event) => setMinUsage(event.target.value)}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              aria-label="Maximum uses"
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="Max"
              value={maxUsage}
              onChange={(event) => setMaxUsage(event.target.value)}
            />
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading inventory…</p>
          ) : visiblePieces.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <PackageOpen className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">
                {pieces.length === 0 ? 'No pieces in inventory yet' : 'No pieces match your filters'}
              </p>
              <p className="text-sm text-muted-foreground">
                {pieces.length === 0
                  ? 'Add a phenolic board or lumber piece to start tracking.'
                  : 'Adjust the search or filters to see more pieces.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((column) => {
                    const active = sortKey === column.key;
                    const Icon = !active ? ArrowUpDown : sortDirection === 'asc' ? ArrowUp : ArrowDown;
                    return (
                      <TableHead key={column.key} aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button
                          type="button"
                          aria-label={`Sort by ${column.label.toLowerCase()}`}
                          className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground"
                          onClick={() => handleSort(column.key)}
                        >
                          {column.label}
                          <Icon className="h-3 w-3" />
                        </button>
                      </TableHead>
                    );
                  })}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePieces.map((piece) => (
                  <TableRow key={piece.id}>
                    <TableCell className="font-mono text-xs" title={piece.id}>
                      {shortId(piece.id)}
                    </TableCell>
                    <TableCell>{formatPieceDimensions(piece)}</TableCell>
                    <TableCell>{materialTypeLabel(piece.materialType)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={conditionBadgeClass(piece.condition)}>
                        {piece.condition}
                      </Badge>
                    </TableCell>
                    <TableCell>{piece.usageCount}</TableCell>
                    <TableCell>
                      <span className="line-clamp-1">{piece.storageLocation.trim() || '—'}</span>
                    </TableCell>
                    <TableCell>{daysInInventory(piece.dateAdded)} d</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`View piece ${shortId(piece.id)}`}
                          onClick={() => setDetailPiece(piece)}
                        >
                          View
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Edit piece ${shortId(piece.id)}`}
                          onClick={() => openEditForm(piece)}
                        >
                          Edit
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

      {formOpen && (
        <PieceFormDialog
          projectId={project.id}
          open={formOpen}
          onOpenChange={setFormOpen}
          piece={editingPiece}
          onSaved={() => {
            setEditingPiece(null);
            void loadPieces();
          }}
        />
      )}

      {detailPiece && (
        <PieceDetailDialog
          piece={detailPiece}
          open={Boolean(detailPiece)}
          onOpenChange={(open) => {
            if (!open) setDetailPiece(null);
          }}
          onEdit={openEditForm}
          onRetired={() => {
            setDetailPiece(null);
            void loadPieces();
          }}
        />
      )}
    </div>
  );
}
