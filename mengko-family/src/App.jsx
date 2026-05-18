import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import LandingPage    from './components/LandingPage';
import VerifyEmail    from './components/VerifyEmail';
import FamilyForm     from './components/FamilyForm';
import AdminDashboard from './components/AdminDashboard';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"      element={<LandingPage />} />
        <Route path="/verify" element={<VerifyEmail user={user} />} />
        <Route path="/join"   element={<FamilyForm  user={user} />} />
        <Route path="/admin"  element={<AdminDashboard user={user} />} />
      </Routes>
    </BrowserRouter>
  );
}
