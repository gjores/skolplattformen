import { createRoot } from 'react-dom/client';
import ProtectedHome from '../../app/protected-home';
import '../../app/globals.css';

// The real shell and navigation guards; only the browser spec supplies synthetic HTTP replies.
createRoot(document.getElementById('root')!).render(<ProtectedHome />);
