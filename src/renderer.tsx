import './index.css';

import { createRoot } from 'react-dom/client';

function ScaffoldCheck() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-950 text-stone-50">
      <div className="rounded-2xl border border-amber-400/30 bg-stone-900 p-6 shadow-2xl">
        <div className="text-sm font-medium text-amber-300">Campfire</div>
        <div className="mt-2 text-xs text-stone-400">React + Tailwind renderer ready</div>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<ScaffoldCheck />);
