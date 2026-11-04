import { useContext } from 'react';
import {
  ProjectProgressContext,
  type ProjectProgressValue,
} from '@/lib/projectProgressContext';

export function useProjectProgress(): ProjectProgressValue {
  const value = useContext(ProjectProgressContext);
  if (!value) {
    throw new Error('useProjectProgress must be used inside ProjectProgressProvider.');
  }
  return value;
}
