import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { daysInInventory, getUsageLog, retirePiece } from '@/db/inventory';
import type { Piece, UsageLogEntry } from '@/db/types';
import {
  conditionBadgeClass,
  formatDate,
  formatMeters,
  formatPieceDimensions,
  materialTypeLabel,
} from '@/lib/format';

export interface PieceDetailDialogProps {
  piece: Piece | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (piece: Piece) => void;
  onRetired: (pieceId: string) => void;
}

export default function PieceDetailDialog({
  piece,
  open,
  onOpenChange,
  onEdit,
  onRetired,
}: PieceDetailDialogProps) {
  const [log, setLog] = useState<UsageLogEntry[]>([]);
  const [retiring, setRetiring] = useState(false);

  useEffect(() => {
    if (!open || !piece) return;
    let active = true;
    setLog([]);
    getUsageLog(piece.projectId, piece.id).then((entries) => {
      if (active) setLog(entries);
    });
    return () => {
      active = false;
    };
  }, [open, piece]);

  if (!piece) return null;

  async function handleRetire() {
    if (!piece) return;
    setRetiring(true);
    try {
      await retirePiece(piece.projectId, piece.id);
      onRetired(piece.id);
      onOpenChange(false);
    } finally {
      setRetiring(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Piece details</DialogTitle>
          <DialogDescription className="font-mono text-xs">{piece.id}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Material type</p>
            <p className="font-medium">{materialTypeLabel(piece.materialType)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Dimensions</p>
            <p className="font-medium">{formatPieceDimensions(piece)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Condition</p>
            <Badge variant="outline" className={conditionBadgeClass(piece.condition)}>
              {piece.condition}
            </Badge>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Usage count</p>
            <p className="font-medium">{piece.usageCount}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Storage location</p>
            <p className="font-medium">{piece.storageLocation.trim() || '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Date added</p>
            <p className="font-medium">
              {formatDate(piece.dateAdded)} · {daysInInventory(piece.dateAdded)} d in inventory
            </p>
          </div>
          {piece.materialType === 'phenolic' && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Thickness</p>
              <p className="font-medium">{formatMeters(piece.thickness)}</p>
            </div>
          )}
          {piece.materialType === 'lumber' && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Cross-section</p>
              <p className="font-medium">{piece.crossSection ?? '—'}</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Usage log</h3>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">No usage recorded yet.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Use</TableHead>
                    <TableHead>Structural member</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {log.map((entry, index) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-muted-foreground">
                        {log.length - index}
                      </TableCell>
                      <TableCell className="font-medium">{entry.structuralMemberLabel}</TableCell>
                      <TableCell>{formatDate(entry.date)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onEdit(piece)}>
            <Pencil className="h-4 w-4" /> Edit piece
          </Button>
          <Button type="button" variant="destructive" disabled={retiring} onClick={handleRetire}>
            <Trash2 className="h-4 w-4" /> {retiring ? 'Retiring…' : 'Retire piece'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
