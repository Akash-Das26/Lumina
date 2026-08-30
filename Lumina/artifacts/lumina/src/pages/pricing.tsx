import { Link } from 'wouter';
import { ArrowLeft, Check, Download, FileText, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSeo } from '@/lib/seo';

const included = [
  'All five focused AI modes',
  'Live source-backed Search',
  'Text and document context',
  'Markdown and JSON exports',
  'No credit card to start',
];

export default function Pricing() {
  useSeo({
    title: 'Lumina AI pricing — useful AI tools that stay free',
    description: 'See what Lumina includes for free: five AI modes, source-backed Search, text-file context, and Markdown or JSON conversation exports.',
    path: '/pricing',
  });

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
              <Sparkles className="h-5 w-5 text-white" />
            </span>
            Lumina
          </Link>
          <Link href="/chat"><Button size="sm">Open Lumina</Button></Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-primary">Simple by design</p>
          <h1 className="text-5xl font-bold tracking-tight md:text-6xl">The useful parts stay free.</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Lumina keeps the core workflow open: ask, research, bring your own context, and take your work with you.
          </p>
        </div>
        <div className="mx-auto mt-14 max-w-xl rounded-3xl border-2 border-primary/30 bg-card p-8 shadow-xl shadow-primary/10 md:p-10">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-sm font-semibold text-primary">Lumina Free</p>
              <h2 className="mt-2 text-3xl font-bold">No daily meter</h2>
              <p className="mt-2 text-sm text-muted-foreground">Available now in this product.</p>
            </div>
            <div className="rounded-2xl bg-primary/10 p-3 text-primary"><Sparkles className="h-6 w-6" /></div>
          </div>
          <div className="my-8 grid gap-4 sm:grid-cols-2">
            {included.map((item) => <div key={item} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{item}</div>)}
          </div>
          <Link href="/chat"><Button size="lg" className="w-full">Start for free</Button></Link>
          <p className="mt-4 text-center text-xs text-muted-foreground">AI responses use the configured model and may be subject to provider availability.</p>
        </div>
        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {[
            [Search, 'Search with receipts', 'Answers come with public source cards you can open and inspect.'],
            [FileText, 'Bring your own context', 'Drop in a text document instead of pasting it in pieces.'],
            [Download, 'Leave with your work', 'Export a clean Markdown or JSON copy whenever you want.'],
          ].map(([Icon, title, text]) => {
            const FeatureIcon = Icon as typeof Search;
            return <div key={String(title)} className="rounded-2xl border border-border bg-card p-5"><FeatureIcon className="h-5 w-5 text-primary" /><h3 className="mt-4 font-semibold">{String(title)}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{String(text)}</p></div>;
          })}
        </div>
        <Link href="/" className="mt-10 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to home</Link>
      </main>
    </div>
  );
}