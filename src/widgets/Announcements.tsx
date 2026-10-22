import { Megaphone } from 'lucide-react';
import { z } from 'zod';
import { fromAnnouncement } from '../reader/items';
import { useOpenItem } from '../reader/ReaderProvider';
import { useAnnouncements, useCatalogStatus, useCourseIds, useNow } from '../canvas/hooks';
import { relative } from '../lib/dates';
import { courseFilter, field } from './settings/fields';
import { CourseDot, EmptyState, QueryGate } from './shared/ui';
import { defineWidget } from './types';

const schema = z.object({
  days: field(z.number().int().min(1).max(120).default(14), {
    label: 'From the last',
    unit: 'days',
  }),
  courseIds: courseFilter(),
  unreadOnly: field(z.boolean().default(false), { label: 'Unread only' }),
  showPreview: field(z.boolean().default(true), { label: 'Show message preview' }),
  previewLines: field(z.number().int().min(1).max(8).default(2), { label: 'Preview lines' }),
  showAuthor: field(z.boolean().default(false), { label: 'Show author' }),
  maxItems: field(z.number().int().min(1).max(50).default(15), { label: 'Max items' }),
});

export const Announcements = defineWidget({
  type: 'announcements',
  name: 'Announcements',
  description: 'Recent course announcements, with unread ones highlighted.',
  icon: Megaphone,
  defaultSize: { w: 4, h: 8 },
  minSize: { w: 3, h: 4 },
  settingsSchema: schema,
  Component: function AnnouncementsWidget({ settings }) {
    const ids = useCourseIds(settings.courseIds);
    const announcements = useAnnouncements(ids, settings.days);
    const status = useCatalogStatus();
    const now = useNow(60_000);
    const openItem = useOpenItem();

    if (ids.length === 0 && !status.isLoading) {
      return (
        <EmptyState>
          {settings.courseIds.length
            ? 'None of the courses picked in this widget’s settings are shown any more.'
            : 'No active courses in Canvas.'}
        </EmptyState>
      );
    }
    return (
      <QueryGate queries={[announcements.query]}>
        {() => {
          const list = settings.unreadOnly ? announcements.data.unread() : announcements.data;
          const items = list.newestFirst().take(settings.maxItems);
          if (items.isEmpty) {
            return (
              <EmptyState>
                {settings.unreadOnly
                  ? 'All caught up.'
                  : `No announcements in the last ${settings.days} days.`}
              </EmptyState>
            );
          }
          return (
            // Newest first, flowing left to right across a wide widget.
            <ul className="wide-grid [--col:18em]">
              {items.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => openItem(fromAnnouncement(a))}
                    className="block w-full rounded-md text-left hover:bg-surface-2/60"
                  >
                    <div className="flex items-center gap-2">
                      <CourseDot color={a.color} />
                      <span
                        className={`min-w-0 flex-1 truncate ${a.isRead ? '' : 'font-semibold'}`}
                      >
                        {a.title}
                      </span>
                      {!a.isRead && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-accent"
                          aria-label="Unread"
                        />
                      )}
                    </div>
                    <div className="ml-[18px] truncate text-xs text-muted">
                      {a.courseName}
                      {a.postedAt && ` · ${relative(a.postedAt, now)}`}
                      {settings.showAuthor && a.author && ` · ${a.author}`}
                    </div>
                    {settings.showPreview && a.message && (
                      <p
                        className="ml-[18px] mt-0.5 whitespace-pre-line break-words text-xs text-muted [overflow-wrap:anywhere]"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: settings.previewLines,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {a.message}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          );
        }}
      </QueryGate>
    );
  },
});
