import Sidebar from "../components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // Stacked (top bar above the page) below 768px; sidebar beside the page from 768px up.
    <div className="flex min-h-screen flex-col bg-surface md:flex-row">
      <Sidebar />

      <div className="mx-auto w-full min-w-0 max-w-[1480px] flex-1">{children}</div>
    </div>
  );
}
