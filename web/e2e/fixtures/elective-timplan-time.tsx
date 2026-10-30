import {createRoot} from 'react-dom/client';
import ProtectedElectiveTimplanTime from '../../app/protected-elective-timplan-time';
import {UnsavedChangesProvider} from '../../lib/unsaved-changes';
import '../../app/globals.css';
const id=(n:number)=>`55203300-0000-4000-8000-${String(n).padStart(12,'0')}`;
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><main style={{padding:'16px',maxWidth:'1000px',margin:'0 auto'}}><ProtectedElectiveTimplanTime unitId={id(1)} schoolYear={2026} frameSourceKey={`class_timplan:${id(2)}:2026:block:iv1`} contextEpoch={1}/></main></UnsavedChangesProvider>);
