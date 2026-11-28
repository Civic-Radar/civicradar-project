'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { buttonClasses } from '../../../components/ui/Button';

export const DOWNLOAD_PDF = 'Download PDF';

// The file name from a Content-Disposition header, or the fallback.
export function attachmentFileName(header: string | null, fallback: string): string {
  const match = header?.match(/filename="([^"]+)"/);
  return match ? match[1] : fallback;
}

// SRS-214.1: the Download PDF button on every document detail page. It is
// enabled when the document has a stored PDF. Selecting it fetches the file
// from GET /api/documents/[id]/download with the signed-in user's token and
// saves it to the device.
export default function DownloadPdfButton({ documentId, available }: { documentId: number; available: boolean }) {
  const [downloading, setDownloading] = useState(false);

  async function download() {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    setDownloading(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachmentFileName(response.headers.get('content-disposition'), `document-${documentId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={!available || downloading}
      className={buttonClasses({ variant: 'secondary' })}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      {DOWNLOAD_PDF}
    </button>
  );
}
