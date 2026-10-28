import { useEffect, useState } from 'react';

// Asks GET /api/role whether the signed-in user is a system administrator.
// null while loading; false when signed out or on any error.
export function useIsAdministrator(): boolean | null {
  const [isAdministrator, setIsAdministrator] = useState<boolean | null>(null);

  useEffect(() => {
    // Ignores a late response after the component unmounts.
    let ignore = false;
    const token = localStorage.getItem('access_token');
    if (!token) { setIsAdministrator(false); return; }

    async function load() {
      try {
        const res = await fetch('/api/role', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (ignore) return;
        if (!res.ok) { setIsAdministrator(false); return; }
        const data = await res.json();
        if (!ignore) setIsAdministrator(data.is_system_administrator === true);
      } catch {
        if (!ignore) setIsAdministrator(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, []);

  return isAdministrator;
}
