export function ScreenHeader({
  title,
  eyebrow,
  id,
}: {
  title: string;
  eyebrow?: string;
  id?: string;
}) {
  return (
    <header className="screen-header">
      {eyebrow && <p className="section-kicker">{eyebrow}</p>}
      <h1 id={id}>{title}</h1>
    </header>
  );
}
