import { Loader2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoHint } from '@/components/ui/info-hint';
import { Checkbox } from '@/components/ui/checkbox';
import { MIN_REUSABLE_OFFCUT } from '@/engine/plywood';
import { formatMeters, shortId } from '@/lib/format';
import type { ReusableOffcutEntry } from './offcuts';

export interface OffcutIntakeProps {
  reusableOffcuts: readonly ReusableOffcutEntry[];
  selectedOffcutKeys: ReadonlySet<string>;
  addedOffcutKeys: ReadonlySet<string>;
  addingOffcuts: boolean;
  intakeError: string;
  onToggleOffcut: (key: string, checked: boolean) => void;
  onAddOffcuts: () => void;
}

export default function OffcutIntake({
  reusableOffcuts,
  selectedOffcutKeys,
  addedOffcutKeys,
  addingOffcuts,
  intakeError,
  onToggleOffcut,
  onAddOffcuts,
}: OffcutIntakeProps) {
  if (reusableOffcuts.length === 0) return null;

  const selectedOffcutCount = reusableOffcuts.filter(
    (entry) => !addedOffcutKeys.has(entry.key) && selectedOffcutKeys.has(entry.key),
  ).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-1">
          <CardTitle className="text-base">Reusable offcuts</CardTitle>
          <InfoHint label="Reusable offcuts">
            Offcuts are at least {formatMeters(MIN_REUSABLE_OFFCUT)} in both dimensions.
            Selected pieces are added to inventory as Good with 0 uses.
          </InfoHint>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {reusableOffcuts.map((entry, index) => {
            const added = addedOffcutKeys.has(entry.key);
            return (
              <li
                key={entry.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    aria-label={
                      entry.pieceId
                        ? `Keep offcut ${index + 1} from reused piece ${shortId(entry.pieceId)}`
                        : `Keep offcut ${index + 1} from sheet ${entry.sheetIndex + 1}`
                    }
                    checked={selectedOffcutKeys.has(entry.key)}
                    disabled={added}
                    onCheckedChange={(checked) => onToggleOffcut(entry.key, checked === true)}
                  />
                  <div>
                    <p className="text-sm font-medium">
                      {formatMeters(entry.offcut.length)} × {formatMeters(entry.offcut.width)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.pieceId
                        ? `Reused piece ${shortId(entry.pieceId)}`
                        : `Sheet ${entry.sheetIndex + 1}`}
                    </p>
                  </div>
                </div>
                {added && (
                  <Badge className="border-emerald-600/30 bg-emerald-50 text-emerald-700">
                    Added
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>

        {intakeError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {intakeError}
          </p>
        )}

        <Button
          type="button"
          disabled={selectedOffcutCount === 0 || addingOffcuts}
          onClick={onAddOffcuts}
        >
          {addingOffcuts ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add selected to inventory
        </Button>
      </CardContent>
    </Card>
  );
}
