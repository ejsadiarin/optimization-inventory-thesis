import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/auth/AuthProvider';
import AppLayout from '@/components/AppLayout';
import ProjectGate from '@/components/ProjectGate';
import ProjectLayout from '@/components/ProjectLayout';
import { ToastProvider } from '@/components/ui/toast';
import LoginScreen from '@/screens/LoginScreen';
import PlannerScreen from '@/screens/PlannerScreen';
import ProjectInventoryScreen from '@/screens/ProjectInventoryScreen';
import ProjectSettingsScreen from '@/screens/ProjectSettingsScreen';
import ProjectsScreen from '@/screens/ProjectsScreen';
import StructuralMembersScreen from '@/screens/StructuralMembersScreen';

export default function App() {
  return (
    <ToastProvider>
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
              <Route path="optimize" element={<Navigate to="../planner" replace />} />
              <Route
                path="summary"
                element={<Navigate to="../planner" replace />}
              />
              <Route path="settings" element={<ProjectSettingsScreen />} />
              <Route
                path="focus"
                element={<Navigate to="../planner?scope=member" replace />}
              />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}
