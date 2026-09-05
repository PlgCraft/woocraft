import { useQuery } from '@tanstack/react-query';

import { getHello } from '@/lib/api';
// Swap src/Admin/logo.svg to rebrand. Vite hashes it into the bundle,
// so nothing in PHP needs to change.
import logo from './logo.svg';

type Status = 'loading' | 'ok' | 'error';

export default function App() {
  const { data, error, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['hello', 'world'],
    queryFn: () => getHello('world'),
  });

  const status: Status = error ? 'error' : isLoading ? 'loading' : 'ok';
  const greeting =
    status === 'ok'
      ? (data?.greeting ?? 'Hello')
      : status === 'loading'
        ? 'Connecting…'
        : 'Could not reach the API';

  return (
    <div className="{{slug}}-app min-h-full bg-background p-6 text-foreground md:p-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="" className="h-9 w-auto shrink-0" />
            <div>
              <div className="text-base font-semibold leading-tight">{{name}}</div>
              <div className="text-xs text-muted-foreground">WooCommerce extension</div>
            </div>
          </div>
          <StatusPill status={status} />
        </header>

        <section className="relative mt-6 overflow-hidden rounded-xl border border-border bg-card p-8 shadow-sm">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-12 h-56 w-56 rounded-full bg-accent/15 blur-3xl" />

          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Live from your REST API
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">{greeting}</h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Served by <Code>GET /{{apiNamespace}}/hello</Code> and rendered by this React
              app. Everything below is wired — start building.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void refetch()}
                disabled={isFetching}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
              >
                {isFetching ? 'Pinging…' : 'Ping again'}
              </button>
              {dataUpdatedAt > 0 && (
                <span className="text-xs text-muted-foreground">
                  last checked {new Date(dataUpdatedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Card
            title="REST route"
            file="src/Http/Routes/Hello.php"
            desc="Add endpoints under Http\Routes\ and register them in Http\Routes.php."
          />
          <Card
            title="Admin UI"
            file="src/Admin/App.tsx"
            desc="React + Vite + Tailwind. The fetch helper and nonce live in lib/api.ts."
          />
          <Card
            title="Toolchain"
            file="npm run lint · stan · build · dev · qit"
            desc="phpcs / phpstan config owned by the CLI; opt-in QIT Marketplace tests."
          />
        </div>

        <footer className="mt-8 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Scaffolded with</span>
          <img src={logo} alt="plgCraft" className="h-4 w-4 opacity-70" />
          <span className="font-medium">woocraft</span>
        </footer>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const meta: Record<Status, { color: string; label: string }> = {
    loading: { color: 'text-amber-500', label: 'Connecting' },
    ok: { color: 'text-emerald-500', label: 'Connected' },
    error: { color: 'text-red-500', label: 'Offline' },
  };
  const { color, label } = meta[status];

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium">
      <span className={`wcf-ping relative inline-flex h-2 w-2 rounded-full bg-current ${color}`} />
      <span>{label}</span>
    </span>
  );
}

function Card({ title, file, desc }: { title: string; file: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
      <code className="mt-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
        {file}
      </code>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 text-[0.85em] text-foreground">{children}</code>
  );
}
