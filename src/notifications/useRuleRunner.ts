import { addDays, startOfDay } from 'date-fns';
import { useEffect, useRef } from 'react';
import { showNotification } from '../app/desktop';
import { useAccountScope } from '../canvas/account';
import { useDeadlines, useNow } from '../canvas/hooks';
import { readJson, writeJson } from '../lib/storage';
import type { Note } from './core';

// The loop every notification hook shares: work out the account, read that account's saved state
// for the rule, ask the rule what to show, save what it returns and show the notes. Each hook
// (useNotifications, useWeeklyPreview, usePlanReminders) only builds the rule's input.

/**
 * The planner window the reminders read: back far enough for course baselines and graded work,
 * ahead past the longest reminder lead (a week) and the coming week. Every notification hook
 * asks for the same one, so they share a single cached request.
 */
export const NOTIFY_WINDOW = { back: 30, ahead: 8 } as const;

/** The current minute and the planner items in NOTIFY_WINDOW around it. */
export function useNotifyDeadlines() {
  const now = useNow(60_000);
  const today = startOfDay(now);
  const deadlines = useDeadlines(
    addDays(today, -NOTIFY_WINDOW.back),
    addDays(today, NOTIFY_WINDOW.ahead),
  );
  return { now, deadlines };
}

/** One notification rule, as the runner drives it. Define it once, outside the component. */
export interface Rule<I, S> {
  /** Storage key prefix; the account scope is appended (`<prefix>:<baseUrl>|<userId>`). */
  prefix: string;
  /** Checks a stored state; null throws it away (then `empty`). */
  parse: (raw: unknown) => S | null;
  empty: S;
  decide: (input: I, state: S) => { notes: Note[]; state: S };
  /** Runs before the first read of `key`, to move state over from an older key. */
  migrate?: (key: string) => void;
}

/** The storage key of `rule`'s state for one account scope. */
export const ruleStorageKey = (prefix: string, scope: string) => `${prefix}:${scope}`;

/**
 * Runs `rule` whenever `input` changes (build it with useMemo; include the time in it so it runs
 * every minute). `null` input means not ready yet: nothing runs or is saved. State is saved only
 * when the rule returns a new object, so a rule that changes nothing writes nothing.
 */
export function useRuleRunner<I, S>(rule: Rule<I, S>, input: I | null) {
  const scope = useAccountScope();
  const key = scope ? ruleStorageKey(rule.prefix, scope) : null;
  const state = useRef<{ key: string; value: S } | null>(null);

  useEffect(() => {
    if (!key || input === null) return;
    if (state.current?.key !== key) {
      rule.migrate?.(key);
      state.current = { key, value: readJson(key, rule.parse, rule.empty) };
    }
    const decided = rule.decide(input, state.current.value);
    if (decided.state !== state.current.value) {
      state.current.value = decided.state;
      writeJson(key, decided.state);
    }
    for (const n of decided.notes) void showNotification(n.title, n.body).catch(() => {});
  }, [rule, key, input]);
}
