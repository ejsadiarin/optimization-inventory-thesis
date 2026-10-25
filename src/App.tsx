import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/auth/AuthProvider';
import AppLayout from '@/components/AppLayout';
import ProjectGate from '@/components/ProjectGate';
import ProjectLayout from '@/components/ProjectLayout';
import LoginScreen from '@/screens/LoginScreen';
import OptimizationScreen from '@/screens/OptimizationScreen';
import ProjectInventoryScreen from '@/screens/ProjectInventoryScreen';
import ProjectOverviewScreen from '@/screens/ProjectOverviewScreen';
import ProjectSettingsScreen from '@/screens/ProjectSettingsScreen';
import ProjectSummaryScreen from '@/screens/ProjectSummaryScreen';
import ProjectsScreen from '@/screens/ProjectsScreen';
import StructuralMembersScreen from '@/screens/StructuralMembersScreen';

export default function App() {
  return (
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
            <Route path="optimize" element={<OptimizationScreen />} />
            <Route path="summary" element={<ProjectSummaryScreen />} />
            <Route path="settings" element={<ProjectSettingsScreen />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
