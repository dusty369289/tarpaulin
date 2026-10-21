import { format, isSameDay, isTomorrow } from 'date-fns';
import type { NotificationPrefs } from './prefs';

// Decides which notifications to show, as a pure function of what Canvas says now, the user's
// preferences and what was already shown (persisted). The hook in useNotifications.ts feeds it
// every minute and whenever data refreshes.
//
// - Deadlines: one reminder per lead time ("1 day", "1 hour"…) for unfinished work. If the app
//   wasn't running when an earlier lead passed, only the closest one fires, never a burst.
// - Announcements and grades: anything that appears after the first time Tarpaulin looked
//   (that first look only records a baseline, so connecting never floods you).
// - Quiet hours hold everything back without marking it seen, so it shows afterwards if still
//   relevant.

export interface DeadlineInput {
  key: string;
  title: string;
  courseName: string;
  dueAt: Date;
  done: boolean;
}
export interface AnnouncementInput {
  id: string;
  title: string;
  courseName: string;
  postedAt: Date | null;
}
export interface GradedInput {
  key: string;
  title: string;
  courseName: string;
}
export interface ScoreInput {
  courseId: string;
  courseName: string;
  score: number | null;
}

export interface NotifyInput {
  /** Unfinished and finished work with a due date. */
  deadlines: DeadlineInput[] | null;
  announcements: AnnouncementInput[] | null;
  /** Work items Canvas reports as graded. */
  graded: GradedInput[] | null;
  scores: ScoreInput[] | null;
}

export interface NotifyState {
  /** Deadline reminder key → smallest lead (minutes) already shown; and when. */
  reminded: Record<string, { lead: number; at: number }>;
  /** null until the first look (baseline). */
  seenAnnouncements: string[] | null;
  seenGraded: string[] | null;
  scores: Record<string, number | null> | null;
}

export const EMPTY_STATE: NotifyState = {
  reminded: {},
  seenAnnouncements: null,
  seenGraded: null,
  scores: null,
};

export interface Note {
  title: string;
  body: string;
}

/** At most this many separate notifications per category per run; more become one summary. */
const MAX_PER_KIND = 3;
/** Announcements older than this aren't "new", even if Tarpaulin hasn't seen them before. */
const FRESH_MS = 3 * 24 * 60 * 60_000;
const KEEP_REMINDERS_MS = 30 * 24 * 60 * 60_000;

function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function inQuietHours(prefs: NotificationPrefs, now: Date): boolean {
  const q = prefs.quietHours;
  if (!q.enabled) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  const [start, end] = [minutesOf(q.start), minutesOf(q.end)];
  if (start === end) return false;
  return start < end ? t >= start && t < end : t >= start || t < end;
}

export function formatRemaining(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`;
  const d = Math.round(h / 24);
  return `${d} days`;
}

function whenLabel(due: Date, now: Date, timeFmt: string) {
  if (isSameDay(due, now)) return `today ${format(due, timeFmt)}`;
  if (isTomorrow(due)) return `tomorrow ${format(due, timeFmt)}`;
  return format(due, `EEE d MMM ${timeFmt}`);
}

function summarise(notes: Note[], summary: (n: number) => Note): Note[] {
  return notes.length > MAX_PER_KIND ? [summary(notes.length)] : notes;
}

export function planNotifications(
  input: NotifyInput,
  prefs: NotificationPrefs,
  prev: NotifyState,
  now: Date,
  timeFmt = 'h:mm a',
): { notes: Note[]; state: NotifyState } {
  const nowMs = now.getTime();
  const state: NotifyState = {
    reminded: Object.fromEntries(
      Object.entries(prev.reminded).filter(([, r]) => nowMs - r.at < KEEP_REMINDERS_MS),
    ),
    seenAnnouncements: prev.seenAnnouncements,
    seenGraded: prev.seenGraded,
    scores: prev.scores,
  };
  // A category that's switched off forgets its baseline, so switching it back on later doesn't
  // announce everything that happened in between.
  if (!prefs.enabled || !prefs.announcements) state.seenAnnouncements = null;
  if (!prefs.enabled || !prefs.grades) {
    state.seenGraded = null;
    state.scores = null;
  }
  // Quiet hours: nothing is shown or marked seen, so it all comes through afterwards.
  if (!prefs.enabled || inQuietHours(prefs, now)) return { notes: [], state };

  const notes: Note[] = [];

  if (prefs.deadlines && input.deadlines && prefs.leads.length) {
    const leads = [...prefs.leads].sort((a, b) => a - b);
    const due: Note[] = [];
    for (const d of input.deadlines) {
      const left = d.dueAt.getTime() - nowMs;
      if (d.done || left <= 0) continue;
      // The closest lead time that has already passed.
      const lead = leads.find((l) => left <= l * 60_000);
      if (lead === undefined) continue;
      const key = `${d.key}@${d.dueAt.toISOString()}`;
      const already = state.reminded[key];
      if (already && already.lead <= lead) continue;
      state.reminded[key] = { lead, at: nowMs };
      due.push({
        title: `Due in ${formatRemaining(left)}: ${d.title}`,
        body: `${d.courseName} · ${whenLabel(d.dueAt, now, timeFmt)}`,
      });
    }
    notes.push(
      ...summarise(due, (n) => ({
        title: `${n} deadlines coming up`,
        body: 'Open Tarpaulin to see what’s due.',
      })),
    );
  }

  if (prefs.announcements && input.announcements) {
    const ids = input.announcements.map((a) => a.id);
    if (state.seenAnnouncements) {
      const seen = new Set(state.seenAnnouncements);
      const fresh = input.announcements.filter(
        (a) => !seen.has(a.id) && (!a.postedAt || nowMs - a.postedAt.getTime() < FRESH_MS),
      );
      notes.push(
        ...summarise(
          fresh.map((a) => ({ title: a.title, body: `New announcement · ${a.courseName}` })),
          (n) => ({ title: `${n} new announcements`, body: 'Open Tarpaulin to read them.' }),
        ),
      );
      // Keep ids that scrolled out of the window too, so they never count as new again.
      state.seenAnnouncements = [...new Set([...state.seenAnnouncements, ...ids])].slice(-500);
    } else {
      state.seenAnnouncements = ids;
    }
  }

  if (prefs.grades) {
    const grades: Note[] = [];
    if (input.graded) {
      const keys = input.graded.map((g) => g.key);
      if (state.seenGraded) {
        const seen = new Set(state.seenGraded);
        for (const g of input.graded)
          if (!seen.has(g.key)) grades.push({ title: `Graded: ${g.title}`, body: g.courseName });
        state.seenGraded = [...new Set([...state.seenGraded, ...keys])].slice(-500);
      } else {
        state.seenGraded = keys;
      }
    }
    if (input.scores) {
      const next: Record<string, number | null> = { ...state.scores };
      for (const s of input.scores) {
        const before = state.scores?.[s.courseId];
        // Only real changes between two known scores; a score appearing for the first time
        // (grades still loading, a new course) is recorded quietly.
        if (
          state.scores &&
          before !== undefined &&
          before !== null &&
          s.score !== null &&
          Math.abs(s.score - before) >= 0.05
        ) {
          grades.push({
            title: `${s.courseName}: ${before.toFixed(1)}% → ${s.score.toFixed(1)}%`,
            body: s.score > before ? 'Your course grade went up.' : 'Your course grade changed.',
          });
        }
        next[s.courseId] = s.score;
      }
      state.scores = next;
    }
    notes.push(
      ...summarise(grades, (n) => ({
        title: `${n} grade updates`,
        body: 'Open Tarpaulin to see your grades.',
      })),
    );
  }

  return { notes, state };
}
