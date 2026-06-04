interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  highlight?: string;
  description?: React.ReactNode;
  right?: React.ReactNode;
}

/**
 * Consistent app-page header in orbital aesthetic:
 *   eyebrow (uppercase mono) → big display title with optional gradient highlight → muted description
 *
 * Use as the top of every internal page so all of them feel like the landing.
 */
export function PageHeader({ eyebrow, title, highlight, description, right }: PageHeaderProps) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <span className="eyebrow mb-3">{eyebrow}</span>}
        <h1
          className="mt-3 text-4xl font-semibold leading-tight md:text-5xl"
          style={{
            fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
            letterSpacing: '-0.025em',
          }}
        >
          {title}{' '}
          {highlight && <span className="grad-text">{highlight}</span>}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-base text-[hsl(var(--text-dim))]">
            {description}
          </p>
        )}
      </div>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}
