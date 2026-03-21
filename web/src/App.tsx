import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Reader from './pages/Reader';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/reader" element={<Reader />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
