// Synthetic component preview for Min tjänst, Personal, Bemanning and navigation (05.1-07). The real shell, menu and view guards;
// tjanst-staff.spec.ts answers every /api/* request with synthetic people and schools. No database, server or live authentication.
import { createRoot } from 'react-dom/client';
import ProtectedHome from '../../app/protected-home';
import '../../app/globals.css';

createRoot(document.getElementById('root')!).render(<ProtectedHome />);
