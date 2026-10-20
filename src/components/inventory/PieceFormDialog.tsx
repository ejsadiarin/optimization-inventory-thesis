import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
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
import { addPiece, updatePiece } from '@/db/inventory';
import type { CrossSection, MaterialType, Piece, PieceCondition } from '@/db/types';

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm';

const CROSS_SECTIONS: CrossSection[] = ['2x2', '2x3', '2x4'];

export interface PieceFormDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  piece?: Piece | null;
  onSaved: (piece: Piece) => void;
}

export default function PieceFormDialog({
  projectId,
  open,
  onOpenChange,
  piece,
  onSaved,
}: PieceFormDialogProps) {
  const editing = Boolean(piece);
  const [materialType, setMaterialType] = useState<MaterialType>(piece?.materialType ?? 'phenolic');
  const [length, setLength] = useState(piece ? String(piece.length) : '');
  const [width, setWidth] = useState(piece ? String(piece.width) : '');
  const [thickness, setThickness] = useState(piece ? String(piece.thickness) : '');
  const [crossSection, setCrossSection] = useState<CrossSection>(piece?.crossSection ?? '2x3');
  const [condition, setCondition] = useState<Exclude<PieceCondition, 'Retired'>>(
    piece?.condition === 'For Inspection' ? 'For Inspection' : 'Good',
  );
  const [storageLocation, setStorageLocation] = useState(piece?.storageLocation ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const parsedLength = Number.parseFloat(length);
    const parsedWidth = Number.parseFloat(width);
    const parsedThickness = Number.parseFloat(thickness);

    if (!Number.isFinite(parsedLength) || parsedLength <= 0) {
      setError('Enter a length greater than zero.');
      return;
    }
    if (materialType === 'phenolic') {
      if (!Number.isFinite(parsedWidth) || parsedWidth <= 0) {
        setError('Enter a width greater than zero.');
        return;
      }
      if (!Number.isFinite(parsedThickness) || parsedThickness <= 0) {
        setError('Enter a thickness greater than zero.');
        return;
      }
    }

    setSaving(true);
    try {
      const saved = piece
        ? await updatePiece(piece.id, {
            length: parsedLength,
            width: materialType === 'lumber' ? 0 : parsedWidth,
            thickness: materialType === 'lumber' ? 0 : parsedThickness,
            crossSection: materialType === 'lumber' ? crossSection : undefined,
            condition,
            storageLocation,
          })
        : await addPiece({
            projectId,
            materialType,
            length: parsedLength,
            width: materialType === 'lumber' ? 0 : parsedWidth,
            thickness: materialType === 'lumber' ? 0 : parsedThickness,
            crossSection: materialType === 'lumber' ? crossSection : undefined,
            condition,
            storageLocation,
          });

      if (!saved) {
        setError('This piece could not be saved.');
        return;
      }

      onSaved(saved);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This piece could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit piece' : 'Add piece'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update dimensions, condition, or storage location.'
              : 'Each physical piece is tracked separately with its own ID.'}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="piece-material-type">Material type</Label>
            <select
              id="piece-material-type"
              className={SELECT_CLASS}
              value={materialType}
              disabled={editing}
              onChange={(event) => setMaterialType(event.target.value as MaterialType)}
            >
              <option value="phenolic">Phenolic Board</option>
              <option value="lumber">Lumber</option>
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="piece-length">Length (m)</Label>
              <Input
                id="piece-length"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={length}
                onChange={(event) => setLength(event.target.value)}
              />
            </div>

            {materialType === 'phenolic' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="piece-width">Width (m)</Label>
                  <Input
                    id="piece-width"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={width}
                    onChange={(event) => setWidth(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="piece-thickness">Thickness (m)</Label>
                  <Input
                    id="piece-thickness"
                    type="number"
                    min="0"
                    step="0.001"
                    inputMode="decimal"
                    value={thickness}
                    onChange={(event) => setThickness(event.target.value)}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="piece-cross-section">Cross-section</Label>
                <select
                  id="piece-cross-section"
                  className={SELECT_CLASS}
                  value={crossSection}
                  onChange={(event) => setCrossSection(event.target.value as CrossSection)}
                >
                  {CROSS_SECTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="piece-condition">Condition</Label>
              <select
                id="piece-condition"
                className={SELECT_CLASS}
                value={condition}
                onChange={(event) =>
                  setCondition(event.target.value as Exclude<PieceCondition, 'Retired'>)
                }
              >
                <option value="Good">Good</option>
                <option value="For Inspection">For Inspection</option>
              </select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="piece-location">Storage location</Label>
              <Input
                id="piece-location"
                value={storageLocation}
                placeholder="e.g. Rack A, storage room"
                onChange={(event) => setStorageLocation(event.target.value)}
              />
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
              {saving ? 'Saving…' : 'Save piece'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
