import { Link } from 'wouter';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { comparisons } from '@/lib/comparisons';
import { useSeo } from '@/lib/seo';

export default function CompareHub() {
  const title = 'AI assistant comparisons: Lumina vs the best alternatives in 2026';
  const description = 'Compare Lumina with ChatGPT, Claude, Perplexity, Gemini, Poe, Merlin, Sider, and Monica on features, pricing, free access, and workflow fit.';
  useSeo({
    title,
    description,
    path: '/compare',
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Product', name: 'Lumina AI', description, brand: { '@type': 'Brand', name: 'Lumina' }, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
        { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Lumina', item: '/' }, { '@type': 'ListItem', position: 2, name: 'AI comparisons', item: '/compare' }] },
      ],
    },
  });

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border/60"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6"><Link href="/" className="flex items-center gap-2 font-bold"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent"><Sparkles className="h-5 w-5 text-white" /></span>Lumina</Link><Link href="/chat"><Button size="sm">Try Lumina <ArrowRight className="ml-2 h-3.5 w-3.5" /></Button></Link></div></header>
      <main>
        <section className="border-b border-border bg-gradient-to-br from-primary/[0.08] via-background to-accent/[0.08] px-6 py-20"><div className="mx-auto max-w-5xl text-center"><Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">Independent comparison guides</Badge><h1 className="mt-6 text-5xl font-bold tracking-tight md:text-7xl">Find the AI assistant that fits your work.</h1><p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">Clear comparisons of Lumina, the original Monica experience, and the tools people actually consider next. No inflated scores. Just the tradeoffs that matter.</p><div className="mt-8 flex justify-center"><Link href="/chat"><Button size="lg">Try Lumina free <ArrowRight className="ml-2 h-4 w-4" /></Button></Link></div></div></section>
        <section className="mx-auto max-w-6xl px-6 py-16"><div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{comparisons.map((comparison, index) => <Link key={comparison.slug} href={`/compare/${comparison.slug}`} className={`group rounded-3xl border bg-card p-6 transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg ${comparison.slug === 'monica' ? 'border-primary/30 md:col-span-2 lg:col-span-3 lg:flex lg:items-center lg:justify-between lg:p-8' : 'border-border'}`}><div className={comparison.slug === 'monica' ? 'max-w-2xl' : ''}><div className="flex items-center justify-between"><p className="text-sm font-semibold text-primary">{comparison.slug === 'monica' ? 'Original product comparison' : `Alternative ${String(index + 1).padStart(2, '0')}`}</p><ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" /></div><h2 className="mt-5 text-2xl font-bold">Lumina vs {comparison.name}</h2><p className="mt-3 leading-relaxed text-muted-foreground">{comparison.shortDescription}</p><div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-500" /> Features</span><span className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-500" /> Pricing</span><span className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-500" /> Verdict</span></div></div>{comparison.slug === 'monica' && <div className="mt-6 hidden rounded-2xl bg-primary/[0.07] p-5 text-sm text-muted-foreground lg:block lg:max-w-sm"><p className="font-semibold text-foreground">Start with the original comparison</p><p className="mt-2">See where Lumina focuses the experience: sources, document context, and portable outputs.</p></div>}</Link>)}</div></section>
      </main>
    </div>
  );
}