// Summary section of the document detail page (SRS-204.2). Shows the stored text
// as plain text, one paragraph per line; renders nothing when there is no text.
export default function DocumentSummary({ text }: { text: string | null }) {
  const paragraphs = (text ?? '').split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
  if (paragraphs.length === 0) return null;

  return (
    <section className="mt-8 break-words rounded-xl border border-line bg-accent-wash/35 p-5 md:p-8">
      <h2 className="text-xl font-semibold tracking-tight">Summary</h2>
      <p className="mt-3 text-xs text-fg-muted">AI-generated summary. Verify against the source document.</p>
      <div className="mt-5 space-y-4 text-base leading-loose text-fg md:text-lg">
        {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
    </section>
  );
}
