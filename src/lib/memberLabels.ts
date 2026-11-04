import type { StructuralMemberType } from '@/db/types';

export const MEMBER_TYPE_LABELS: Record<StructuralMemberType, string> = {
  column: 'Column',
  beam: 'Beam',
  slab: 'Slab',
};
