export type Comparison = {
  slug: string;
  name: string;
  shortDescription: string;
  category: string;
  website: string;
  sourceLabel: string;
  sourceUrl: string;
  pricing: string;
  freeOption: string;
  speed: string;
  accuracy: string;
  easeOfUse: string;
  bestFor: string;
  luminaWins: string[];
  competitorWins: string[];
  verdict: string;
  features: Array<{ label: string; lumina: string; competitor: string }>;
  faqs: Array<{ question: string; answer: string }>;
};

const commonFeatures = [
  { label: 'Focused AI modes', lumina: '5 modes', competitor: 'Varies' },
  { label: 'Live source-backed search', lumina: 'Yes', competitor: 'See notes' },
  { label: 'Bring your own text files', lumina: 'Yes', competitor: 'Varies' },
  { label: 'Markdown / JSON export', lumina: 'Yes', competitor: 'Varies' },
  { label: 'Streaming chat', lumina: 'Yes', competitor: 'Yes' },
];

export const comparisons: Comparison[] = [
  {
    slug: 'chatgpt',
    name: 'ChatGPT',
    shortDescription: 'A broad general-purpose AI assistant from OpenAI.',
    category: 'General AI assistant',
    website: 'https://chatgpt.com',
    sourceLabel: 'OpenAI Help Center',
    sourceUrl: 'https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data',
    pricing: 'Free tier plus paid plans',
    freeOption: 'Yes, with plan-specific limits',
    speed: 'Fast, model-dependent',
    accuracy: 'Strong general reasoning; verify important facts',
    easeOfUse: 'Very easy',
    bestFor: 'General-purpose questions, coding, and a mature AI ecosystem',
    luminaWins: ['Source cards are visible directly below Search answers', 'One focused workspace for five distinct workflows', 'Instant Markdown and JSON conversation exports'],
    competitorWins: ['Broader ecosystem and deeper model/tool selection', 'Long-established integrations and custom GPT workflows'],
    verdict: 'Choose Lumina when you want a calmer, workflow-first assistant with visible source cards and easy exports. Choose ChatGPT when breadth of tools and ecosystem depth matter most.',
    features: commonFeatures.map((item) => item.label === 'Live source-backed search' ? { ...item, competitor: 'Search available; citation experience varies' } : item),
    faqs: [
      { question: 'Is Lumina a good ChatGPT alternative?', answer: 'Yes, if you want five focused modes, source cards for Search, text-file context, and local one-click exports. ChatGPT remains the stronger choice for its broader ecosystem and custom workflows.' },
      { question: 'ChatGPT vs Lumina: which is better?', answer: 'Neither is universally better. Lumina is simpler and more workflow-oriented; ChatGPT offers a larger platform with more tools and integrations.' },
    ],
  },
  {
    slug: 'claude',
    name: 'Claude',
    shortDescription: 'Anthropic’s assistant, known for writing and long-form reasoning.',
    category: 'Writing and reasoning assistant',
    website: 'https://claude.ai',
    sourceLabel: 'Anthropic',
    sourceUrl: 'https://www.anthropic.com/claude',
    pricing: 'Free tier plus paid plans',
    freeOption: 'Yes, with usage limits',
    speed: 'Fast; varies by model and load',
    accuracy: 'Strong writing and reasoning; verify important facts',
    easeOfUse: 'Very easy',
    bestFor: 'Long-form writing, analysis, and thoughtful collaboration',
    luminaWins: ['Search mode includes inspectable public source cards', 'Purpose-built Translate and Artist modes alongside writing', 'Clean exports without leaving the conversation'],
    competitorWins: ['Strong reputation for nuanced writing and long documents', 'Anthropic’s model and safety approach are central to the product'],
    verdict: 'Choose Lumina for a multi-workflow command center and grounded Search. Choose Claude when long-form writing quality and Anthropic’s model experience are your priority.',
    features: commonFeatures.map((item) => item.label === 'Live source-backed search' ? { ...item, competitor: 'Not the primary product focus' } : item),
    faqs: [
      { question: 'Is Lumina a good Claude alternative?', answer: 'Lumina is a good alternative for users who want writing plus Search, translation, image prompting, and easy exports in one focused interface. Claude is a strong choice for long-form reasoning and writing.' },
      { question: 'Claude vs Lumina: which is better for writing?', answer: 'Claude is optimized around writing and reasoning. Lumina adds workflow modes and source-backed research, so the better fit depends on whether you need a writer or a broader workbench.' },
    ],
  },
  {
    slug: 'perplexity',
    name: 'Perplexity',
    shortDescription: 'An answer engine built around web research and citations.',
    category: 'Research answer engine',
    website: 'https://www.perplexity.ai',
    sourceLabel: 'Perplexity',
    sourceUrl: 'https://www.perplexity.ai/hub/blog/getting-started-with-perplexity',
    pricing: 'Free tier plus paid plans',
    freeOption: 'Yes, with plan-specific limits',
    speed: 'Fast for web research',
    accuracy: 'Strong research workflow; sources still need checking',
    easeOfUse: 'Very easy',
    bestFor: 'Fast web research with clickable citations',
    luminaWins: ['Adds writing, translation, chat, and Artist workflows', 'Attach text files to keep document work in the same thread', 'Export complete conversations as Markdown or JSON'],
    competitorWins: ['Deeper research product focus and search controls', 'Citation-first experience is its core strength'],
    verdict: 'Choose Lumina when research is one part of a wider creative workflow. Choose Perplexity when your main job is web research and citation depth.',
    features: commonFeatures.map((item) => item.label === 'Live source-backed search' ? { ...item, competitor: 'Yes; citation-first' } : item),
    faqs: [
      { question: 'Is Lumina a good Perplexity alternative?', answer: 'Yes for users who want research plus writing, translation, image prompting, file context, and exports. Perplexity is the more specialized option for citation-heavy web research.' },
      { question: 'Perplexity vs Lumina: which is better for research?', answer: 'Perplexity is the stronger dedicated research tool. Lumina is better when research needs to flow into writing, translation, or a broader conversation.' },
    ],
  },
  {
    slug: 'gemini',
    name: 'Gemini',
    shortDescription: 'Google’s multimodal assistant connected to the Google ecosystem.',
    category: 'Multimodal assistant',
    website: 'https://gemini.google.com',
    sourceLabel: 'Google Gemini',
    sourceUrl: 'https://gemini.google.com',
    pricing: 'Free access plus paid Google AI plans',
    freeOption: 'Yes, with plan-specific limits',
    speed: 'Fast; varies by model and load',
    accuracy: 'Strong multimodal capability; verify important facts',
    easeOfUse: 'Easy',
    bestFor: 'Google ecosystem users and multimodal prompts',
    luminaWins: ['No Google account required to explore the core UI', 'Purposeful mode switching instead of one generic input', 'Built-in export and file-context affordances'],
    competitorWins: ['Google ecosystem integrations', 'Strong multimodal and product-connected experiences'],
    verdict: 'Choose Lumina for an independent, focused workspace with visible Search sources and portable outputs. Choose Gemini when Google apps and multimodal ecosystem integration are central to your day.',
    features: commonFeatures.map((item) => item.label === 'Live source-backed search' ? { ...item, competitor: 'Google Search-connected features vary' } : item),
    faqs: [
      { question: 'Is Lumina a good Gemini alternative?', answer: 'Lumina is a good alternative when you want a focused AI workbench that is not tied to the Google ecosystem and makes sources and exports explicit.' },
      { question: 'Gemini vs Lumina: which is better?', answer: 'Gemini is a natural fit for Google users. Lumina is a better fit for a compact, mode-based workflow with source cards and portable conversation files.' },
    ],
  },
  {
    slug: 'poe',
    name: 'Poe',
    shortDescription: 'Quora’s multi-bot platform for trying different AI models.',
    category: 'Multi-model AI platform',
    website: 'https://poe.com',
    sourceLabel: 'Poe',
    sourceUrl: 'https://poe.com',
    pricing: 'Free access plus subscription options',
    freeOption: 'Yes, with usage points and limits',
    speed: 'Varies by bot',
    accuracy: 'Depends on the selected bot',
    easeOfUse: 'Easy',
    bestFor: 'Comparing many bots in one platform',
    luminaWins: ['A calmer, opinionated workflow instead of a bot directory', 'Grounded Search with source cards', 'Simple, free conversation exports'],
    competitorWins: ['Large selection of bots and model personalities', 'Multi-model experimentation is a core feature'],
    verdict: 'Choose Lumina when you value a guided workflow and practical outputs. Choose Poe when comparing many different bots is the point of the product.',
    features: commonFeatures.map((item) => item.label === 'Focused AI modes' ? { ...item, competitor: 'Many bots' } : item),
    faqs: [
      { question: 'Is Lumina a good Poe alternative?', answer: 'Yes for users who prefer five clear workflows over browsing a large bot catalog. Poe is better for experimenting with many community and model-specific bots.' },
      { question: 'Poe vs Lumina: which is easier to use?', answer: 'Lumina has fewer choices and a more guided interface. Poe offers more variety, but that variety can add decision overhead.' },
    ],
  },
  {
    slug: 'merlin',
    name: 'Merlin',
    shortDescription: 'A browser-oriented AI assistant with multi-model access.',
    category: 'Browser AI assistant',
    website: 'https://www.getmerlin.in',
    sourceLabel: 'Product Hunt alternatives',
    sourceUrl: 'https://www.producthunt.com/products/monica-3/alternatives',
    pricing: 'Free tier plus paid plans',
    freeOption: 'Yes, with usage limits',
    speed: 'Fast; browser context can vary',
    accuracy: 'Depends on model and supplied context',
    easeOfUse: 'Easy',
    bestFor: 'AI help inside browser workflows',
    luminaWins: ['A distraction-free standalone workspace', 'Visible live sources and direct exports', 'Document context without relying on browser selection'],
    competitorWins: ['Browser-oriented workflows', 'Multi-model access and extension use cases'],
    verdict: 'Choose Lumina for a clean workspace you can return to and export from. Choose Merlin when AI inside browser pages is the primary use case.',
    features: commonFeatures.map((item) => item.label === 'Live source-backed search' ? { ...item, competitor: 'Browser/search features vary' } : item),
    faqs: [
      { question: 'Is Lumina a good Merlin alternative?', answer: 'Lumina is a good alternative when you want a standalone, focused workspace with source cards, document context, and exports. Merlin is stronger for browser-native assistance.' },
      { question: 'Merlin vs Lumina: which should I choose?', answer: 'Choose Merlin for in-page browser help. Choose Lumina for deliberate sessions that move from research to writing and then into an exportable result.' },
    ],
  },
  {
    slug: 'sider',
    name: 'Sider',
    shortDescription: 'A browser extension and AI workspace with multiple model access.',
    category: 'Browser AI workspace',
    website: 'https://sider.ai',
    sourceLabel: 'Cabina.AI alternatives guide',
    sourceUrl: 'https://cabina.ai/blog/5-best-monica-ai-alternatives-to-use',
    pricing: 'Free tier plus paid plans',
    freeOption: 'Yes, with usage limits',
    speed: 'Fast; varies by model',
    accuracy: 'Depends on selected model',
    easeOfUse: 'Easy',
    bestFor: 'Multiple models and AI assistance across web pages',
    luminaWins: ['Less setup and model-choice overhead', 'Source-backed Search and portable exports', 'Five purpose-built workflows in one consistent UI'],
    competitorWins: ['Browser extension workflows', 'Multiple model access and page-level assistance'],
    verdict: 'Choose Lumina for a focused, browser-independent command center. Choose Sider when page-level assistance and model variety are more important than a guided workflow.',
    features: commonFeatures.map((item) => item.label === 'Focused AI modes' ? { ...item, competitor: 'Multiple models and tools' } : item),
    faqs: [
      { question: 'Is Lumina a good Sider alternative?', answer: 'Lumina is a good alternative for a focused workflow with source-backed Search, file context, and exports. Sider is a better fit for users who want an AI layer across many web pages.' },
      { question: 'Sider vs Lumina: which is better?', answer: 'Sider emphasizes browser assistance and model variety. Lumina emphasizes simplicity, modes, grounded answers, and outputs you can take with you.' },
    ],
  },
  {
    slug: 'monica',
    name: 'Monica',
    shortDescription: 'The original all-in-one AI assistant and browser companion this site was inspired by.',
    category: 'All-in-one AI assistant',
    website: 'https://monica.im',
    sourceLabel: 'Monica official pricing',
    sourceUrl: 'https://www.monica.im/pricing',
    pricing: 'Free tier plus paid plans',
    freeOption: 'Yes; Monica says free users have a daily usage limit',
    speed: 'Varies by selected model and load',
    accuracy: 'Varies by selected model; verify important facts',
    easeOfUse: 'Easy',
    bestFor: 'Browser assistance, multiple AI models, and a broad tool suite',
    luminaWins: ['Core Search, file context, and exports are explicit in the product UI', 'A smaller, calmer five-mode experience', 'No daily meter in the current Lumina product'],
    competitorWins: ['Broader browser enhancement and tool surface', 'Multiple model and media capabilities'],
    verdict: 'Lumina is the better fit if you want a focused command center with inspectable sources, document context, and portable exports. Monica remains attractive for users who want a broader browser companion and wider tool catalog.',
    features: [
      { label: 'Focused AI modes', lumina: '5 modes', competitor: 'Broad tool suite' },
      { label: 'Live source-backed search', lumina: 'Yes, with source cards', competitor: 'AI Search advertised' },
      { label: 'Bring your own text files', lumina: 'Yes', competitor: 'Document features advertised' },
      { label: 'Markdown / JSON export', lumina: 'Yes', competitor: 'Not found in reviewed public pages' },
      { label: 'Free usage', lumina: 'No daily meter in this product', competitor: 'Daily usage limit for free users' },
    ],
    faqs: [
      { question: 'Is Lumina a good Monica alternative?', answer: 'Lumina is a good Monica alternative if you want a smaller, more focused workflow with visible sources, text-file context, and free exports. Monica offers a wider browser and media feature surface.' },
      { question: 'Monica vs Lumina: which is better?', answer: 'Lumina is better for a focused research-to-output flow. Monica is better for users who want browser-side assistance and a broader all-in-one tool catalog.' },
    ],
  },
];

export const getComparison = (slug: string) => comparisons.find((comparison) => comparison.slug === slug);