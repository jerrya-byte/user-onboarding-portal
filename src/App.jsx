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
import ReviewSubmission from './pages/manager/ReviewSubmission';
import ProtectedRoute from './components/ProtectedRoute';

// Wrap any internal-staff route (HR or Manager) in <ProtectedRoute>
// so that an authenticated Microsoft session is required to view it.
// Candidate routes stay public — the candidate is gated by their
// magic link.
const staff = (el) => <ProtectedRoute>{el}</ProtectedRoute>;

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/hr/dashboard" replace />} />
        <Route path="/hr/new" element={staff(<NewRequest />)} />
        <Route path="/hr/dashboard" element={staff(<Dashboard />)} />
        <Route path="/hr/identities" element={staff(<Identities />)} />
        <Route path="/hr/termination" element={staff(<Termination />)} />
        <Route path="/hr/reissue" element={staff(<ReissueLink />)} />
        <Route path="/hr/reissue/:id" element={staff(<ReissueLink />)} />
        <Route path="/manager/dashboard" element={staff(<ManagerDashboard />)} />
        <Route path="/manager/review/:id" element={staff(<ReviewSubmission />)} />
        <Route path="/candidate/auth" element={<AuthLanding />} />
        <Route path="/candidate/form" element={<OnboardingForm />} />
        <Route path="/candidate/done" element={<Confirmation />} />
        <Route path="*" element={<Navigate to="/hr/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
