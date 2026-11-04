import type { LumberUnplaced, UnplacedPanel } from '@/engine/types';
import { crossSectionLabel, formatMeters } from '@/lib/format';

export interface ProjectNotification {
  id: string;
  title: string;
  description: string;
  href: string;
  items: string[];
}

export function buildProjectNotifications(
  oversizedPanels: readonly UnplacedPanel[],
  oversizedLumber: readonly LumberUnplaced[],
): ProjectNotification[] {
  const notifications: ProjectNotification[] = [];

  if (oversizedPanels.length > 0) {
    notifications.push({
      id: 'oversized-panels',
      title: `${oversizedPanels.length} panel${
        oversizedPanels.length === 1 ? '' : 's'
      } exceed${oversizedPanels.length === 1 ? 's' : ''} the stock sheet`,
      description:
        'Increase the phenolic sheet size or split these panels before cutting.',
      href: 'optimize?step=cuts',
      items: oversizedPanels.map(
        (panel) => `${panel.label} (${formatMeters(panel.length)} × ${formatMeters(panel.width)})`,
      ),
    });
  }

  if (oversizedLumber.length > 0) {
    notifications.push({
      id: 'oversized-lumber',
      title: `${oversizedLumber.length} lumber requirement${
        oversizedLumber.length === 1 ? '' : 's'
      } exceed${oversizedLumber.length === 1 ? 's' : ''} the stock lengths`,
      description: 'Add a longer stock length in Settings or split these requirements.',
      href: 'optimize?step=cuts',
      items: oversizedLumber.map(
        (requirement) =>
          `${requirement.label} (${formatMeters(requirement.length)} · ${crossSectionLabel(
            requirement.crossSection,
          )})`,
      ),
    });
  }

  return notifications;
}
