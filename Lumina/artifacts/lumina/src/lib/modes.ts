import { MessageSquare, Search, PenLine, Sparkles, Languages, LucideIcon } from 'lucide-react';

export type ModeKey = 'chat' | 'search' | 'write' | 'artist' | 'translate';

export interface Mode {
  id: ModeKey;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const MODES: Mode[] = [
  {
    id: 'chat',
    label: 'Chat',
    icon: MessageSquare,
    description: 'General assistant for questions and tasks',
  },
  {
    id: 'search',
    label: 'Search',
    icon: Search,
    description: 'Web-aware answers with current information',
  },
  {
    id: 'write',
    label: 'Write',
    icon: PenLine,
    description: 'Writing and editing assistance',
  },
  {
    id: 'artist',
    label: 'Artist',
    icon: Sparkles,
    description: 'Generate images from text prompts',
  },
  {
    id: 'translate',
    label: 'Translate',
    icon: Languages,
    description: 'Multilingual translation',
  },
];

export function getModeById(id: string): Mode {
  return MODES.find((m) => m.id === id) || MODES[0];
}
