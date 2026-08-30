import { Link } from 'wouter';
import { ArrowRight, Zap, Shield, Sparkles, Globe, PenLine, Languages, MessageSquare, ChevronDown, Search, FileText, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { MODES } from '@/lib/modes';
import { useSeo } from '@/lib/seo';

export default function Landing() {
  useSeo({
    title: 'Lumina AI — the focused command center for serious thinking',
    description: 'Lumina is a focused AI command center for chat, source-backed search, writing, translation, document context, and free conversation exports.',
    path: '/',
  });

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">Lumina</span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link href="/pricing" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:block">
              Pricing
            </Link>
            <Link href="/compare" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground md:block">
              Compare
            </Link>
            <Link href="/sign-in">
              <Button variant="ghost" data-testid="link-sign-in">
                Sign In
              </Button>
            </Link>
            <Link href="/chat">
              <Button data-testid="link-get-started" className="gap-2">
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-fade-in">
            <Zap className="w-4 h-4" />
            Five modes. One powerful AI.
          </div>
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6 animate-slide-in stagger-1">
            The Command Center
            <br />
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              For Serious Thinking
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed animate-slide-in stagger-2">
            Lumina adapts to how you work. Chat, search with receipts, bring your own documents, and export the result—all powered by the same AI, with the useful parts free.
          </p>
          <div className="flex items-center justify-center gap-4 animate-slide-in stagger-3">
            <Link href="/chat">
              <Button size="lg" className="gap-2 text-lg h-14 px-8" data-testid="button-launch-lumina">
                Launch Lumina
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="text-lg h-14 px-8" data-testid="button-learn-more">
              <ChevronDown className="w-5 h-5 mr-2" />
              Learn More
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><Search className="h-4 w-4 text-primary" /> Source-backed Search</span>
            <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Document context</span>
            <span className="flex items-center gap-2"><Download className="h-4 w-4 text-primary" /> Free exports</span>
          </div>
        </div>
      </section>

      {/* Differentiators */}
      <section className="border-y border-border bg-[#17122b] px-6 py-24 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-14 max-w-2xl">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">The Lumina difference</p>
            <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Less friction between a question and useful work.</h2>
            <p className="mt-5 text-lg leading-relaxed text-white/65">
              Monica’s public pricing says its free plan has a daily usage limit. Lumina takes a different approach for the core workflow: source-backed research, document context, and exports are available here without a daily meter.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: Search, eyebrow: 'Search with receipts', title: 'See where the answer came from.', text: 'Search mode pulls live public results and shows the source cards beneath the response, so you can open and inspect them.' },
              { icon: FileText, eyebrow: 'Bring your own context', title: 'Drop a document. Keep the thread.', text: 'Attach text, Markdown, CSV, JSON, HTML, or log files and ask the model to summarize, compare, or rewrite them.' },
              { icon: Download, eyebrow: 'Take it with you', title: 'Your work is never trapped.', text: 'Download any conversation as clean Markdown or structured JSON, and copy a URL for sharing or returning later.' },
            ].map(({ icon: Icon, eyebrow, title, text }) => (
              <div key={eyebrow} className="rounded-2xl border border-white/10 bg-white/[0.06] p-7 transition hover:-translate-y-1 hover:border-cyan-300/40">
                <Icon className="h-6 w-6 text-cyan-300" />
                <p className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">{eyebrow}</p>
                <h3 className="mt-3 text-2xl font-semibold">{title}</h3>
                <p className="mt-3 leading-relaxed text-white/60">{text}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex items-center gap-2 text-sm text-white/50">
            <ExternalLink className="h-4 w-4" />
            <span>Claims about Monica’s free tier are based on its public pricing page, checked during this build.</span>
          </div>
          <Link href="/compare" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-white">
            Compare Lumina with ChatGPT, Claude, Perplexity, and more <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Modes Grid */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">Five Distinct Modes</h2>
          <p className="text-center text-muted-foreground text-lg mb-16 max-w-2xl mx-auto">
            Each mode is optimized for a specific workflow. Switch instantly. Never lose context.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {MODES.map((mode, idx) => {
              const Icon = mode.icon;
              return (
                <div
                  key={mode.id}
                  className={`group p-8 rounded-2xl border border-border bg-card hover:border-primary/50 transition-all hover:shadow-lg animate-slide-in stagger-${idx + 1}`}
                  data-testid={`card-mode-${mode.id}`}
                >
                  <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-2">{mode.label}</h3>
                  <p className="text-muted-foreground leading-relaxed">{mode.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16">Built for Performance</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Real-Time Streaming</h3>
              <p className="text-muted-foreground">
                Responses appear as they're generated. No waiting. Instant feedback.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Context Retention</h3>
              <p className="text-muted-foreground">
                Every conversation remembers what you've said. Build on prior exchanges.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Adaptive Intelligence</h3>
              <p className="text-muted-foreground">
                The same AI model, fine-tuned by mode. Precision where it matters.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16">Made for Real Work</h2>
          <div className="space-y-8">
            <div className="flex items-start gap-6 p-8 rounded-2xl bg-card border border-border">
              <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Rapid Prototyping</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Draft ideas in Chat mode, refine them in Write, generate visuals in Artist. All in one session.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-6 p-8 rounded-2xl bg-card border border-border">
              <div className="w-12 h-12 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Research Synthesis</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Search for sources, summarize findings, translate foreign papers. Lumina handles the workflow.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-6 p-8 rounded-2xl bg-card border border-border">
              <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <PenLine className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Content Production</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Write posts, edit drafts, generate hero images. Ship faster without context switching.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Not a Toy. A Tool.</h2>
          <p className="text-xl text-muted-foreground leading-relaxed mb-8">
            Most AI assistants feel like demos. Lumina was built for people who think seriously about their work.
            It's fast, focused, and designed to disappear when you don't need it—and deliver exactly what you need when you do.
          </p>
          <p className="text-lg text-muted-foreground italic">
            "The best tool is the one you forget you're using."
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-gradient-to-br from-primary/10 via-accent/5 to-background">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Ready to Think Faster?</h2>
          <p className="text-xl text-muted-foreground mb-10">
            Start a conversation. Switch modes. See what happens when AI adapts to you.
          </p>
          <Link href="/chat">
            <Button size="lg" className="gap-2 text-lg h-14 px-10" data-testid="button-start-now">
              Start Now
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto text-center text-sm text-muted-foreground">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-foreground">Lumina</span>
          </div>
          <p>Built for people who think seriously. © 2024 Lumina AI.</p>
          <Link href="/compare" className="mt-3 inline-block text-primary hover:underline">AI assistant comparisons</Link>
        </div>
      </footer>
    </div>
  );
}
