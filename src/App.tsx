import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/auth/AuthProvider';
import AppLayout from '@/components/AppLayout';
import ProjectGate from '@/components/ProjectGate';
import ProjectLayout from '@/components/ProjectLayout';
import { ToastProvider } from '@/components/ui/toast';
import LoginScreen from '@/screens/LoginScreen';
import MemberFocusScreen from '@/screens/MemberFocusScreen';
import OptimizationScreen from '@/screens/OptimizationScreen';
import PlannerScreen from '@/screens/PlannerScreen';
import ProjectInventoryScreen from '@/screens/ProjectInventoryScreen';
import ProjectOverviewScreen from '@/screens/ProjectOverviewScreen';
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
              <Route index element={<ProjectOverviewScreen />} />
              <Route path="members" element={<StructuralMembersScreen />} />
              <Route path="inventory" element={<ProjectInventoryScreen />} />
              <Route path="planner" element={<PlannerScreen />} />
              <Route path="optimize" element={<OptimizationScreen />} />
              <Route path="summary" element={<Navigate to=".." replace />} />
              <Route path="settings" element={<ProjectSettingsScreen />} />
              <Route path="focus" element={<MemberFocusScreen />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}
