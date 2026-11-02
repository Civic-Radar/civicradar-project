import Card from '../../../components/ui/Card';

// Summary section of the document detail page (SRS-204.2). Shows the stored text
// as plain text, one paragraph per line; renders nothing when there is no text.
// SRS-207.1: a View source PDF link follows the text when there is a PDF link.
// SRS-207.2: the link opens that stored PDF in a new tab.
// SRS-210.2: a Failed document with no text shows the Failed message instead.
export default function DocumentSummary({
  text,
  sourcePdfUrl = null,
  summaryStatus = null,
}: {
  text: string | null;
  sourcePdfUrl?: string | null;
  summaryStatus?: 'Pending' | 'Complete' | 'Failed' | null;
}) {
  const paragraphs = (text ?? '').split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
  if (paragraphs.length === 0) {
    if (summaryStatus !== 'Failed') return null;
    // No disclaimer and no View source PDF link: no summary is displayed, and
    // the PDF viewer follows directly below.
    return (
      <Card as="section" aria-labelledby="summary-heading" className="break-words p-5 md:p-7">
        <h2 id="summary-heading" className="text-lg font-semibold tracking-tight">Summary</h2>
        {/* SRS-210.2: the message text must stay word for word. */}
        <p className="mt-2 text-fg-muted">A summary could not be generated for this document. You can still read the original PDF below.</p>
      </Card>
    );
  }

  return (
    <Card as="section" aria-labelledby="summary-heading" className="break-words p-5 md:p-7">
      <h2 id="summary-heading" className="text-lg font-semibold tracking-tight">Summary</h2>
      {/* SRS-204.4: the disclaimer text must stay word for word. */}
      <p className="mt-2 inline-block rounded-md bg-accent-wash px-2.5 py-1 text-xs font-medium text-accent-strong">AI-generated summary. Verify against the source document.</p>
      <div className="mt-5 max-w-prose space-y-4 text-base leading-relaxed text-fg">
        {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
      {sourcePdfUrl ? (
        <p className="mt-5">
          {/* Points to the stored copy the summary was generated from, never the source site. */}
          <a href={sourcePdfUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">View source PDF</a>
        </p>
      ) : null}
    </Card>
  );
}
