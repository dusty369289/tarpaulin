import { useCanvas } from './CanvasProvider';
import { useProfile } from './hooks';

// What this device keeps per Canvas account (notification state, plans) is filed under one
// scope, `<baseUrl>|<userId>`, so signing in to another account never reads or shows the first
// one's. The strings are part of stored keys: don't change their shape.

/** `<baseUrl>|<userId>`. */
export const accountScope = (baseUrl: string, userId: string) => `${baseUrl}|${userId}`;

/** Whether a stored key looks like an account scope. */
export const isAccountScope = (s: string) => s.includes('|');

/**
 * The signed-in account's scope: null until the profile is known, so nothing reads or writes
 * another account's state meanwhile. If the profile can't load, the Canvas address alone has to
 * do.
 */
export function useAccountScope(): string | null {
  const baseUrl = useCanvas().client?.baseUrl;
  const profile = useProfile();
  const userId = profile.data?.id ?? (profile.isError ? '' : null);
  return baseUrl && userId !== null ? accountScope(baseUrl, userId) : null;
}
