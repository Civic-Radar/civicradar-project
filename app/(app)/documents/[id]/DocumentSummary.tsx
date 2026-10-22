// Summary section of the document detail page (SRS-204.2). Shows the stored text
// as plain text, one paragraph per line; renders nothing when there is no text.
export default function DocumentSummary({ text }: { text: string | null }) {
  const paragraphs = (text ?? '').split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
  if (paragraphs.length === 0) return null;

  return (
    <section className="mt-8 break-words">
      <h2 className="text-lg font-semibold">Summary</h2>
      <div className="mt-2 space-y-3 text-fg-muted">
        {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
    </section>
  );
}
