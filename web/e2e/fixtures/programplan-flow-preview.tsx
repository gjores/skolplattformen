import {createRoot} from 'react-dom/client';
import ProtectedProgramplanFlow from '../../app/protected-programplan-flow';
import {UnsavedChangesProvider} from '../../lib/unsaved-changes';
import '../../app/globals.css';
import '../../app/protected-programplan.css';
const onOpen=async()=>{},onSecurityFailure=()=>false;
// Component evidence only. All API responses are intercepted; no database or IdP.
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><main className="protected-programplan" style={{padding:'1rem'}}><ProtectedProgramplanFlow scope="synthetic-flow-feedback" initialMode="new" disabled={false} onOpen={onOpen} onSecurityFailure={onSecurityFailure}/></main></UnsavedChangesProvider>);
