import { Link, useParams } from 'wouter';
import { ArrowLeft, ArrowRight, Check, ExternalLink, FileText, Search, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getComparison, comparisons } from '@/lib/comparisons';
import { useSeo } from '@/lib/seo';

function BrandMark({ competitor = false }: { competitor?: boolean }) {
  return competitor ? (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-sm font-bold text-muted-foreground">VS</div>
  ) : (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent"><Sparkles className="h-5 w-5 text-white" /></div>
  );
}

export default function ComparisonPage() {
  const { slug = 'monica' } = useParams();
  const comparison = getComparison(slug) || comparisons[comparisons.length - 1];
  const title = `Lumina vs ${comparison.name}: features, pricing, and which is better in 2026`;
  const description = `Compare Lumina and ${comparison.name} on features, pricing, free access, speed, accuracy, ease of use, and workflow fit. See which AI assistant is right for you.`;
  const path = `/compare/${comparison.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Product', name: 'Lumina AI', description: 'A focused AI command center with chat, search, writing, artist, translation, document context, and exports.', brand: { '@type': 'Brand', name: 'Lumina' }, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
      { '@type': 'FAQPage', mainEntity: comparison.faqs.map((faq) => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer } })) },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Lumina', item: '/' }, { '@type': 'ListItem', position: 2, name: 'Compare', item: '/compare' }, { '@type': 'ListItem', position: 3, name: `Lumina vs ${comparison.name}`, item: path }] },
    ],
  };
  useSeo({ title, description, path, jsonLd });

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-bold"><BrandMark /><span>Lumina</span></Link>
          <div className="flex items-center gap-3"><Link href="/compare" className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">All comparisons</Link><Link href="/chat"><Button size="sm">Try Lumina <ArrowRight className="ml-2 h-3.5 w-3.5" /></Button></Link></div>
        </div>
      </header>
      <main>
        <section className="border-b border-border bg-gradient-to-br from-primary/[0.08] via-background to-accent/[0.08] px-6 py-16 md:py-24">
          <div className="mx-auto max-w-5xl">
            <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground"><Link href="/compare" className="hover:text-foreground">Compare</Link><span>/</span><span>{comparison.name}</span></div>
            <div className="grid items-end gap-10 md:grid-cols-[1fr_auto]">
              <div>
                <Badge variant="outline" className="mb-5 border-primary/20 bg-primary/5 text-primary">2026 comparison guide</Badge>
                <h1 className="max-w-4xl text-4xl font-bold tracking-tight md:text-6xl">Lumina vs {comparison.name}: <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">which is better?</span></h1>
                <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">{comparison.shortDescription} This honest comparison looks at the workflow differences that matter when choosing an AI assistant.</p>
              </div>
              <div className="hidden rounded-3xl border border-border bg-card p-5 shadow-lg md:block"><div className="flex items-center gap-3"><BrandMark /><span className="font-semibold">Lumina</span><span className="text-muted-foreground">vs</span><BrandMark competitor /><span className="font-semibold">{comparison.name}</span></div></div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-14">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl border-2 border-primary/25 bg-primary/[0.04] p-7">
              <div className="flex items-center gap-3"><BrandMark /><div><p className="text-sm font-semibold text-primary">Lumina</p><h2 className="text-xl font-bold">A focused command center</h2></div></div>
              <p className="mt-5 leading-relaxed text-muted-foreground">{comparison.luminaWins[0]}. {comparison.luminaWins[1]}.</p>
              <div className="mt-6 space-y-3">{comparison.luminaWins.map((win) => <div key={win} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{win}</div>)}</div>
            </div>
            <div className="rounded-3xl border border-border bg-card p-7">
              <div className="flex items-center gap-3"><BrandMark competitor /><div><p className="text-sm font-semibold text-muted-foreground">{comparison.name}</p><h2 className="text-xl font-bold">{comparison.category}</h2></div></div>
              <p className="mt-5 leading-relaxed text-muted-foreground">{comparison.competitorWins[0]}. {comparison.competitorWins[1]}.</p>
              <div className="mt-6 space-y-3">{comparison.competitorWins.map((win) => <div key={win} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />{win}</div>)}</div>
            </div>
          </div>
        </section>

        <section className="bg-muted/30 px-6 py-16">
          <div className="mx-auto max-w-5xl">
            <div className="mb-8 flex items-end justify-between gap-6"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Side by side</p><h2 className="mt-2 text-3xl font-bold">The details that change the decision</h2></div><p className="hidden max-w-xs text-right text-sm text-muted-foreground md:block">Designed to scan quickly on desktop or mobile.</p></div>
            <div className="grid gap-3">
              {comparison.features.map((feature, index) => (
                <div key={feature.label} className="grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-[1.2fr_1fr_1fr] md:items-center">
                  <div className="font-semibold">{feature.label}</div>
                  <div className="rounded-xl bg-primary/[0.07] p-3 text-sm"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-primary">Lumina</span>{feature.lumina}</div>
                  <div className="rounded-xl bg-muted/60 p-3 text-sm"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{comparison.name}</span>{feature.competitor}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                ['Pricing', 'Lumina', comparison.pricing, 'Free', 'Free core workflow'],
                ['Free option', 'Lumina', 'No daily meter in this product', comparison.name, comparison.freeOption],
                ['Speed', 'Lumina', 'Streaming responses', comparison.name, comparison.speed],
                ['Accuracy', 'Lumina', 'Depends on model and source context', comparison.name, comparison.accuracy],
                ['Ease of use', 'Lumina', 'Five clear modes', comparison.name, comparison.easeOfUse],
              ].map(([label, leftName, left, rightName, right]) => (
                <div key={label} className="rounded-2xl border border-border bg-card p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><div className="mt-4 flex items-start justify-between gap-5 text-sm"><div><p className="font-medium text-primary">{leftName}</p><p className="mt-1 text-muted-foreground">{left}</p></div><div className="text-right"><p className="font-medium">{rightName}</p><p className="mt-1 text-muted-foreground">{right}</p></div></div></div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-16">
          <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] to-accent/[0.08] p-8 md:p-12"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Our verdict</p><h2 className="mt-3 text-3xl font-bold">Which one should you choose?</h2><p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">{comparison.verdict}</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/chat"><Button size="lg">Try Lumina free <ArrowRight className="ml-2 h-4 w-4" /></Button></Link><a href={comparison.website} target="_blank" rel="noreferrer"><Button size="lg" variant="outline">Visit {comparison.name} <ExternalLink className="ml-2 h-4 w-4" /></Button></a></div><p className="mt-5 text-xs text-muted-foreground">Product details can change. Review the linked provider page for the latest terms.</p></div>
        </section>

        <section className="border-t border-border px-6 py-16">
          <div className="mx-auto max-w-5xl"><div className="mb-8 flex items-center gap-3"><Search className="h-5 w-5 text-primary" /><h2 className="text-3xl font-bold">Common questions</h2></div><div className="grid gap-4 md:grid-cols-2">{comparison.faqs.map((faq) => <div key={faq.question} className="rounded-2xl border border-border bg-card p-6"><h3 className="font-semibold">{faq.question}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p></div>)}</div></div>
        </section>

        <section className="bg-muted/30 px-6 py-16"><div className="mx-auto max-w-5xl"><div className="mb-8 flex items-center gap-3"><FileText className="h-5 w-5 text-primary" /><h2 className="text-3xl font-bold">More AI comparisons</h2></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{comparisons.filter((item) => item.slug !== comparison.slug).slice(0, 6).map((item) => <Link key={item.slug} href={`/compare/${item.slug}`} className="group rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/40"><p className="font-semibold">Lumina vs {item.name}</p><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.shortDescription}</p><span className="mt-4 flex items-center gap-1 text-sm font-medium text-primary">Read comparison <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></span></Link>)}</div></div></section>
        <div className="mx-auto max-w-5xl px-6 py-8"><a href={comparison.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /> Reference: {comparison.sourceLabel}</a></div>
      </main>
    </div>
  );
}