import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/** Shell da aplicação: sidebar fixa + topbar + área de conteúdo. */
export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto bg-muted/40 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
