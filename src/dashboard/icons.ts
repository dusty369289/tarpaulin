import {
  BookOpen,
  Calendar,
  Coffee,
  Flame,
  GraduationCap,
  Heart,
  LayoutDashboard,
  Rocket,
  Sparkles,
  Star,
  Sun,
  Target,
  type LucideIcon,
} from 'lucide-react';

export const PAGE_ICONS: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  target: Target,
  calendar: Calendar,
  sparkles: Sparkles,
  'book-open': BookOpen,
  'graduation-cap': GraduationCap,
  star: Star,
  flame: Flame,
  rocket: Rocket,
  sun: Sun,
  coffee: Coffee,
  heart: Heart,
};

export const pageIcon = (name: string): LucideIcon => PAGE_ICONS[name] ?? LayoutDashboard;
