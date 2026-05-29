type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const hasError = params['error'] !== undefined;

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div style={{ width: '100%', maxWidth: '320px' }}>
        <p
          style={{
            color: 'var(--accent)',
            fontFamily: 'var(--mono)',
            fontSize: '0.7rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            marginBottom: '2rem',
          }}
        >
          dewald-os
        </p>

        <form method="POST" action="/api/auth/login" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            type="password"
            name="password"
            placeholder="password"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            autoComplete="current-password"
            style={{
              background: 'var(--bg-1)',
              border: `1px solid ${hasError ? 'var(--hot)' : 'var(--border)'}`,
              color: 'var(--ink-0)',
              fontFamily: 'var(--mono)',
              fontSize: '0.875rem',
              padding: '0.75rem 1rem',
              outline: 'none',
              borderRadius: '3px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />

          {hasError && (
            <span
              style={{
                color: 'var(--hot)',
                fontFamily: 'var(--mono)',
                fontSize: '0.75rem',
              }}
            >
              invalid password
            </span>
          )}

          <button
            type="submit"
            style={{
              background: 'var(--accent)',
              color: 'var(--bg)',
              fontFamily: 'var(--mono)',
              fontSize: '0.8rem',
              fontWeight: 600,
              letterSpacing: '0.05em',
              padding: '0.75rem 1rem',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
            }}
          >
            enter →
          </button>
        </form>
      </div>
    </div>
  );
}
