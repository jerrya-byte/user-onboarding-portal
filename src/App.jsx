import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import NewRequest from './pages/hr/NewRequest';
import Dashboard from './pages/hr/Dashboard';
import Identities from './pages/hr/Identities';
import Termination from './pages/hr/Termination';
import ReissueLink from './pages/hr/ReissueLink';
import AuthLanding from './pages/candidate/AuthLanding';
import OnboardingForm from './pages/candidate/OnboardingForm';
import Confirmation from './pages/candidate/Confirmation';
import ManagerDashboard from './pages/manager/Dashboard';
import PrepareSubmission from './pages/manager/PrepareSubmission';
import ReviewSubmission from './pages/manager/ReviewSubmission';
import SecurityClearances from './pages/security/Clearances';
import SelfService from './pages/me/SelfService';
import ProtectedRoute from './components/ProtectedRoute';
import { ROLES, useUserRole } from './lib/roles';

const HR_ONLY = [ROLES.HR_ADMIN];
const HR_OR_MANAGER = [ROLES.HR_ADMIN, ROLES.MANAGER];
const HR_OR_PSO = [ROLES.HR_ADMIN, ROLES.PSO];
const ANY_STAFF = [ROLES.HR_ADMIN, ROLES.MANAGER, ROLES.PSO, ROLES.END_USER];

// Resolve "/" to the role-appropriate landing page. Wrapped in
// ProtectedRoute so the user is signed in before we read their role.
function HomeRedirect() {
  const { homePath } = useUserRole();
  return <Navigate to={homePath} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomeRedirect />
            </ProtectedRoute>
          }
        />

        {/* HR Admin */}
        <Route path="/hr/new" element={<ProtectedRoute requiredRoles={HR_ONLY}><NewRequest /></ProtectedRoute>} />
        <Route path="/hr/dashboard" element={<ProtectedRoute requiredRoles={HR_ONLY}><Dashboard /></ProtectedRoute>} />
        <Route path="/hr/identities" element={<ProtectedRoute requiredRoles={HR_ONLY}><Identities /></ProtectedRoute>} />
        <Route path="/hr/termination" element={<ProtectedRoute requiredRoles={HR_ONLY}><Termination /></ProtectedRoute>} />
        <Route path="/hr/reissue" element={<ProtectedRoute requiredRoles={HR_ONLY}><ReissueLink /></ProtectedRoute>} />
        <Route path="/hr/reissue/:id" element={<ProtectedRoute requiredRoles={HR_ONLY}><ReissueLink /></ProtectedRoute>} />

        {/* Manager (or HR Admin) */}
        <Route path="/manager/dashboard" element={<ProtectedRoute requiredRoles={HR_OR_MANAGER}><ManagerDashboard /></ProtectedRoute>} />
        <Route path="/manager/prepare/:id" element={<ProtectedRoute requiredRoles={HR_OR_MANAGER}><PrepareSubmission /></ProtectedRoute>} />
        <Route path="/manager/review/:id" element={<ProtectedRoute requiredRoles={HR_OR_MANAGER}><ReviewSubmission /></ProtectedRoute>} />

        {/* Personal Security Officer (or HR Admin) */}
        <Route path="/security/clearances" element={<ProtectedRoute requiredRoles={HR_OR_PSO}><SecurityClearances /></ProtectedRoute>} />

        {/* Any authenticated staff member with a role */}
        <Route path="/me" element={<ProtectedRoute requiredRoles={ANY_STAFF}><SelfService /></ProtectedRoute>} />

        {/* Candidate (public, gated by magic link) */}
        <Route path="/candidate/auth" element={<AuthLanding />} />
        <Route path="/candidate/form" element={<OnboardingForm />} />
        <Route path="/candidate/done" element={<Confirmation />} />

        {/* Anything else -> role-appropriate home */}
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <HomeRedirect />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
