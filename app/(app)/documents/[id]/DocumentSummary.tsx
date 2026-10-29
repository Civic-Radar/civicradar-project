import Card from '../../../components/ui/Card';

// Summary section of the document detail page (SRS-204.2). Shows the stored text
// as plain text, one paragraph per line; renders nothing when there is no text.
export default function DocumentSummary({ text }: { text: string | null }) {
  const paragraphs = (text ?? '').split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
  if (paragraphs.length === 0) return null;

  return (
    <Card as="section" aria-labelledby="summary-heading" className="break-words p-5 md:p-7">
      <h2 id="summary-heading" className="text-lg font-semibold tracking-tight">Summary</h2>
      {/* SRS-204.4: the disclaimer text must stay word for word. */}
      <p className="mt-2 inline-block rounded-md bg-accent-wash px-2.5 py-1 text-xs font-medium text-accent-strong">AI-generated summary. Verify against the source document.</p>
      <div className="mt-5 max-w-prose space-y-4 text-base leading-relaxed text-fg">
        {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
    </Card>
  );
}
