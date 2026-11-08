import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/auth/AuthProvider';
import AppLayout from '@/components/AppLayout';
import ProjectGate from '@/components/ProjectGate';
import ProjectLayout from '@/components/ProjectLayout';
import { ToastProvider } from '@/components/ui/toast';

const LoginScreen = lazy(() => import('@/screens/LoginScreen'));
const PlannerScreen = lazy(() => import('@/screens/PlannerScreen'));
const ReviewCommitScreen = lazy(() => import('@/screens/ReviewCommitScreen'));
const ProjectInventoryScreen = lazy(() => import('@/screens/ProjectInventoryScreen'));
const ProjectSettingsScreen = lazy(() => import('@/screens/ProjectSettingsScreen'));
const ProjectsScreen = lazy(() => import('@/screens/ProjectsScreen'));
const StructuralMembersScreen = lazy(() => import('@/screens/StructuralMembersScreen'));

function ScreenFallback() {
  return (
    <p role="status" className="p-6 text-sm text-muted-foreground">
      Loading…
    </p>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Suspense fallback={<ScreenFallback />}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />

          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<ProjectsScreen />} />
            </Route>
            <Route path="/projects/:projectId" element={<ProjectGate />}>
              <Route element={<ProjectLayout />}>
                <Route index element={<Navigate to="planner" replace />} />
                <Route path="members" element={<StructuralMembersScreen />} />
                <Route path="inventory" element={<ProjectInventoryScreen />} />
                <Route path="planner" element={<PlannerScreen />} />
                <Route path="review" element={<ReviewCommitScreen />} />
                <Route path="optimize" element={<Navigate to="../review" replace />} />
                <Route
                  path="summary"
                  element={<Navigate to="../review" replace />}
                />
                <Route path="settings" element={<ProjectSettingsScreen />} />
                <Route
                  path="focus"
                  element={<Navigate to="../planner" replace />}
                />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ToastProvider>
  );
}
