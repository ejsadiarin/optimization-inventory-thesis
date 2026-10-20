import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import ProjectGate from '@/components/ProjectGate';
import ProjectLayout from '@/components/ProjectLayout';
import ProjectInventoryScreen from '@/screens/ProjectInventoryScreen';
import ProjectOverviewScreen from '@/screens/ProjectOverviewScreen';
import ProjectSettingsScreen from '@/screens/ProjectSettingsScreen';
import ProjectsScreen from '@/screens/ProjectsScreen';
import StructuralMembersScreen from '@/screens/StructuralMembersScreen';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<ProjectsScreen />} />
      </Route>

      {/*
        Project-scoped routes are gated by the access code.
        Tickets #3 (structural members) and #4 (inventory) append one <Route>
        each under the ProjectLayout route, and one entry to PROJECT_NAV_ITEMS.
      */}
      <Route path="/projects/:projectId" element={<ProjectGate />}>
        <Route element={<ProjectLayout />}>
          <Route index element={<ProjectOverviewScreen />} />
          <Route path="members" element={<StructuralMembersScreen />} />
          <Route path="inventory" element={<ProjectInventoryScreen />} />
          <Route path="settings" element={<ProjectSettingsScreen />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
