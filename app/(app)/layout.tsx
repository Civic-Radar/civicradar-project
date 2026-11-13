import SearchHighlight from "../components/SearchHighlight";
import SessionGuard from "../components/SessionGuard";
import Sidebar from "../components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // Signed-in pages only: SessionGuard sends the user to the login page when the
    // sign-in is missing or has expired (issue #521).
    <SessionGuard>
      {/* Stacked (top bar above the page) below 768px; sidebar beside the page from 768px up. */}
      <div className="flex min-h-screen flex-col bg-surface md:flex-row">
        <Sidebar />

        <div className="mx-auto w-full min-w-0 max-w-[1480px] flex-1">
          {/* Highlights searched words when a page is opened from Search. */}
          <SearchHighlight>{children}</SearchHighlight>
        </div>
      </div>
    </SessionGuard>
  );
}