import { useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEFAULT_COSTS, DEFAULT_STOCK, updateProjectSettings } from '@/db/projects';
import type { Project } from '@/db/types';
import { triggerRefresh } from '@/lib/useRefreshSignal';

function toNumber(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default function ProjectSettingsScreen() {
  const project = useOutletContext<Project>();

  const [phenolicCost, setPhenolicCost] = useState(String(project.costs.phenolicPerSheet));
  const [lumberCost, setLumberCost] = useState(String(project.costs.lumberPerPiece));
  const [sheetLength, setSheetLength] = useState(String(project.stock.phenolic.length));
  const [sheetWidth, setSheetWidth] = useState(String(project.stock.phenolic.width));
  const [lumberLengths, setLumberLengths] = useState<string[]>(
    project.stock.lumberLengths.map(String),
  );
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  function markDirty() {
    if (saved) setSaved(false);
    if (saveError) setSaveError('');
  }

  function updateLumberLength(index: number, value: string) {
    markDirty();
    setLumberLengths((current) => current.map((item, i) => (i === index ? value : item)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedLengths = lumberLengths
      .map((value) => Number.parseFloat(value))
      .filter((value) => Number.isFinite(value) && value > 0);

    try {
      const updated = await updateProjectSettings(project.id, {
        costs: {
          phenolicPerSheet: toNumber(phenolicCost, project.costs.phenolicPerSheet),
          lumberPerPiece: toNumber(lumberCost, project.costs.lumberPerPiece),
        },
        stock: {
          phenolic: {
            length: toNumber(sheetLength, project.stock.phenolic.length),
            width: toNumber(sheetWidth, project.stock.phenolic.width),
          },
          lumberLengths: parsedLengths.length > 0 ? parsedLengths : DEFAULT_STOCK.lumberLengths,
        },
      });

      if (!updated) {
        setSaved(false);
        setSaveError('Could not save settings because the project is not available online.');
        return;
      }

      setSaveError('');
      setSaved(true);
      triggerRefresh();
    } catch {
      setSaved(false);
      setSaveError('Could not save settings. Check your connection and try again.');
    }
  }

  function restoreDefaults() {
    markDirty();
    setPhenolicCost(String(DEFAULT_COSTS.phenolicPerSheet));
    setLumberCost(String(DEFAULT_COSTS.lumberPerPiece));
    setSheetLength(String(DEFAULT_STOCK.phenolic.length));
    setSheetWidth(String(DEFAULT_STOCK.phenolic.width));
    setLumberLengths(DEFAULT_STOCK.lumberLengths.map(String));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Project settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure material costs and stock sizes. Defaults follow standard Philippine sizes.
        </p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Material costs</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phenolic-cost">Phenolic board cost (₱ per sheet)</Label>
              <Input
                id="phenolic-cost"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={phenolicCost}
                onChange={(event) => {
                  markDirty();
                  setPhenolicCost(event.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lumber-cost">Lumber cost (₱ per piece)</Label>
              <Input
                id="lumber-cost"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={lumberCost}
                onChange={(event) => {
                  markDirty();
                  setLumberCost(event.target.value);
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Phenolic stock sheet</CardTitle>
            <CardDescription>Dimensions of a purchased board in meters.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sheet-length">Stock sheet length (m)</Label>
              <Input
                id="sheet-length"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={sheetLength}
                onChange={(event) => {
                  markDirty();
                  setSheetLength(event.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sheet-width">Stock sheet width (m)</Label>
              <Input
                id="sheet-width"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={sheetWidth}
                onChange={(event) => {
                  markDirty();
                  setSheetWidth(event.target.value);
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Lumber stock lengths</CardTitle>
            <CardDescription>Standard purchased lengths in meters.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {lumberLengths.map((value, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="flex-1 space-y-2">
                  <Label htmlFor={`lumber-length-${index}`}>Lumber stock length {index + 1} (m)</Label>
                  <Input
                    id={`lumber-length-${index}`}
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    value={value}
                    onChange={(event) => updateLumberLength(index, event.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label={`Remove lumber stock length ${index + 1}`}
                  onClick={() => {
                    markDirty();
                    setLumberLengths((current) => current.filter((_, i) => i !== index));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                markDirty();
                setLumberLengths((current) => [...current, '']);
              }}
            >
              <Plus className="h-4 w-4" /> Add length
            </Button>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="ghost" onClick={restoreDefaults}>
            <RotateCcw className="h-4 w-4" /> Restore defaults
          </Button>
          <div className="flex flex-col items-end gap-1">
            {saved && (
              <span role="status" className="text-sm font-medium text-primary">
                Settings saved
              </span>
            )}
            {saveError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {saveError}
              </p>
            )}
            <Button type="submit">Save settings</Button>
          </div>
        </div>
      </form>
    </div>
  );
}
