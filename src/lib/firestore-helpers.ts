import {
  collection,
  doc,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function requireDb() {
  if (!db) {
    throw new Error('Firestore is not configured.');
  }
  return db;
}

export function projectRef(projectId: string) {
  return doc(requireDb(), 'projects', projectId);
}

export function projectCollection(projectId: string, name: string) {
  return collection(requireDb(), 'projects', projectId, name);
}

export function projectDoc(projectId: string, name: string, id: string) {
  return doc(requireDb(), 'projects', projectId, name, id);
}

export function dataWithId<T>(
  snapshot: DocumentSnapshot | QueryDocumentSnapshot,
): T | undefined {
  const data: DocumentData | undefined = snapshot.data();
  if (!data) return undefined;
  return { ...data, id: snapshot.id } as T;
}

export function docsWithData<T>(snapshot: {
  docs: (DocumentSnapshot | QueryDocumentSnapshot)[];
}): T[] {
  const items: T[] = [];
  for (const document of snapshot.docs) {
    const item = dataWithId<T>(document);
    if (item) items.push(item);
  }
  return items;
}

export function requireProjectId(projectId: string): string {
  if (!projectId) {
    throw new Error('Project id is required.');
  }
  return projectId;
}
