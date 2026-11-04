import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  PackageOpen,
  Plus,
  SearchX,
} from 'lucide-react';
import PieceDetailDialog from '@/components/inventory/PieceDetailDialog';
import PieceFormDialog from '@/components/inventory/PieceFormDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
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
import { daysInInventory, getActivePieces, listPieces, queryPieces } from '@/db/inventory';
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
  shortId,
} from '@/lib/format';
import { piecesToCsv } from '@/lib/csv';
import { buildDatedFilename, downloadTextFile } from '@/lib/download';
import { useRefreshSignal } from '@/lib/useRefreshSignal';
import { useIsDesktop } from '@/lib/useIsDesktop';

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

function parseUsage(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

interface PieceActionsProps {
  piece: Piece;
  onView: (piece: Piece) => void;
  onEdit: (piece: Piece) => void;
}

function PieceActions({ piece, onView, onEdit }: PieceActionsProps) {
  return (
    <div className="flex justify-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`View piece ${shortId(piece.id)}`}
        onClick={(event) => {
          event.stopPropagation();
          onView(piece);
        }}
      >
        View
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`Edit piece ${shortId(piece.id)}`}
        onClick={(event) => {
          event.stopPropagation();
          onEdit(piece);
        }}
      >
        Edit
      </Button>
    </div>
  );
}

export default function ProjectInventoryScreen() {
  const project = useOutletContext<Project>();
  const refreshSignal = useRefreshSignal();
  const { toast } = useToast();
  const isDesktop = useIsDesktop();
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const loadedOnceRef = useRef(false);

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

  const refresh = useCallback(async () => {
    try {
      setPieces(await getActivePieces(project.id));
      loadedOnceRef.current = true;
      setLoadError('');
    } catch {
      if (!loadedOnceRef.current) {
        setLoadError('Could not load inventory. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshSignal]);

  const retry = useCallback(() => {
    setLoadError('');
    setLoading(true);
    void refresh();
  }, [refresh]);

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

  function clearFilters() {
    setSearch('');
    setTypeFilter('all');
    setConditionFilter('all');
    setMinUsage('');
    setMaxUsage('');
  }

  function openEditForm(piece: Piece) {
    setDetailPiece(null);
    setEditingPiece(piece);
    setFormOpen(true);
  }

  async function handleExportCsv() {
    try {
      const allPieces = await listPieces(project.id);
      downloadTextFile(
        buildDatedFilename(project.name, 'inventory', 'csv'),
        piecesToCsv(allPieces),
        'text/csv;charset=utf-8',
      );
    } catch {
      toast({
        title: 'Could not export inventory records',
        description: 'Try again when the project is available.',
        variant: 'error',
      });
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Inventory"
        description="Track every phenolic board and lumber piece across its lifecycle."
        actions={
          loading || Boolean(loadError) || pieces.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {pieces.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleExportCsv()}
                >
                  <Download className="h-4 w-4" /> Export CSV
                </Button>
              )}
              <Button type="button" onClick={openAddForm}>
                <Plus className="h-4 w-4" /> Add piece
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="inventory-search">Search inventory</Label>
          <Input
            id="inventory-search"
            value={search}
            placeholder="Label, dimensions, type, or location"
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
        {!isDesktop && (
          <div className="space-y-1">
            <Label htmlFor="inventory-sort">Sort by</Label>
            <select
              id="inventory-sort"
              className={SELECT_CLASS}
              value={sortKey}
              onChange={(event) => handleSort(event.target.value as PieceSortKey)}
            >
              {COLUMNS.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loadError ? (
        <ErrorState message={loadError} onRetry={retry} />
      ) : loading ? (
        <Card>
          <CardContent className="p-0">
            <p className="p-6 text-sm text-muted-foreground">Loading inventory…</p>
          </CardContent>
        </Card>
      ) : visiblePieces.length === 0 ? (
        pieces.length === 0 ? (
          <EmptyState
            icon={PackageOpen}
            title="No pieces in inventory yet"
            description="Add a phenolic board or lumber piece to start tracking."
            action={
              <Button type="button" onClick={openAddForm}>
                <Plus className="h-4 w-4" /> Add piece
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title="No pieces match your filters"
            description="Adjust the search or filters to see more pieces."
            action={
              <Button type="button" variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        )
      ) : (
        <Card>
          <CardContent className="p-0">
            {isDesktop ? (
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
                    <TableRow
                      key={piece.id}
                      tabIndex={0}
                      className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      onClick={() => setDetailPiece(piece)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setDetailPiece(piece);
                        }
                      }}
                    >
                      <TableCell>
                        {piece.label ? (
                          <div className="space-y-0.5">
                            <p className="font-medium">{piece.label}</p>
                            <p className="font-mono text-xs text-muted-foreground" title={piece.id}>
                              {shortId(piece.id)}
                            </p>
                          </div>
                        ) : (
                          <span className="font-mono text-xs" title={piece.id}>
                            {shortId(piece.id)}
                          </span>
                        )}
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
                        <PieceActions
                          piece={piece}
                          onView={setDetailPiece}
                          onEdit={openEditForm}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <ul data-testid="piece-cards" className="space-y-2 p-3">
                {visiblePieces.map((piece) => (
                  <li key={piece.id} className="rounded-lg border">
                    <button
                      type="button"
                      aria-label={`Open piece ${shortId(piece.id)}`}
                      className="w-full space-y-2 rounded-t-lg p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      onClick={() => setDetailPiece(piece)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          {piece.label && (
                            <p className="font-medium">{piece.label}</p>
                          )}
                          <p className="font-mono text-xs" title={piece.id}>
                            {shortId(piece.id)}
                          </p>
                          <p className="font-medium">{formatPieceDimensions(piece)}</p>
                        </div>
                        <Badge variant="outline" className={conditionBadgeClass(piece.condition)}>
                          {piece.condition}
                        </Badge>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                        <div>
                          <dt className="text-muted-foreground">Type</dt>
                          <dd>{materialTypeLabel(piece.materialType)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Usage</dt>
                          <dd>{piece.usageCount}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Location</dt>
                          <dd className="truncate">{piece.storageLocation.trim() || '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Days in inventory</dt>
                          <dd>{daysInInventory(piece.dateAdded)} d</dd>
                        </div>
                      </dl>
                    </button>
                    <div className="px-3 pb-3">
                      <PieceActions
                        piece={piece}
                        onView={setDetailPiece}
                        onEdit={openEditForm}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {formOpen && (
        <PieceFormDialog
          projectId={project.id}
          open={formOpen}
          onOpenChange={setFormOpen}
          piece={editingPiece}
          onSaved={() => {
            setEditingPiece(null);
            void refresh();
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
            void refresh();
          }}
        />
      )}
    </div>
  );
}
