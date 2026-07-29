import Link from "next/link";

export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="placeholderPage">
      <section className="placeholderPage-card">
        <p className="placeholderPage-eyebrow">WCA Rankings</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <Link href="/">Back to rankings</Link>
      </section>
    </main>
  );
}
