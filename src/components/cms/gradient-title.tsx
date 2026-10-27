const GRADIENT =
  'bg-gradient-to-r from-[#25D366] via-emerald-600 to-[#128C7E] bg-clip-text text-transparent';

/**
 * Splits a CMS headline so its second half gets the brand gradient:
 * "A — B" highlights B, "Replai for X" highlights X, anything else renders
 * plain. Keeps the designed look while the whole headline stays editable.
 */
export function GradientTitle({ title }: { title: string }) {
  const dash = title.indexOf('—');
  if (dash > 0 && title.slice(dash + 1).trim()) {
    return (
      <>
        {title.slice(0, dash).trim()}
        {' — '}
        <span className={GRADIENT}>{title.slice(dash + 1).trim()}</span>
      </>
    );
  }
  const match = /^(.+?\bfor\s)(.+)$/i.exec(title);
  if (match) {
    return (
      <>
        {match[1]}
        <span className={GRADIENT}>{match[2]}</span>
      </>
    );
  }
  return <>{title}</>;
}
