import { BookOpen } from 'lucide-react';
import type { CSSProperties } from 'react';
import { z } from 'zod';
import { useCanvas } from '../canvas/CanvasProvider';
import { useCatalog, useCatalogStatus, useCourseIds } from '../canvas/hooks';
import { courseFilter, field } from './settings/fields';
import { EmptyState, QueryGate } from './shared/ui';
import { defineWidget } from './types';

const schema = z.object({
  layout: field(z.enum(['list', 'tiles']).default('list'), { label: 'Layout' }),
  courseIds: courseFilter(),
  showCode: field(z.boolean().default(true), { label: 'Show course code' }),
  showTerm: field(z.boolean().default(false), { label: 'Show term' }),
  showScore: field(z.boolean().default(false), { label: 'Show current score' }),
});

export const CourseList = defineWidget({
  type: 'course-list',
  name: 'Courses',
  description: 'Quick links to your courses in their colours.',
  icon: BookOpen,
  defaultSize: { w: 4, h: 6 },
  minSize: { w: 2, h: 3 },
  settingsSchema: schema,
  Component: function CourseListWidget({ settings }) {
    const catalog = useCatalog();
    const status = useCatalogStatus();
    const ids = useCourseIds(settings.courseIds);
    const { openLink } = useCanvas();

    return (
      <QueryGate queries={[status]}>
        {() => {
          const courses = catalog.inScope.filter((c) => ids.includes(c.id));
          if (courses.isEmpty) return <EmptyState>No courses in scope.</EmptyState>;
          const tiles = settings.layout === 'tiles';
          // Both layouts add columns as the widget widens (tiles from 10em, rows from 15em) and
          // share out spare height; roomy rows turn into cards (`.course-rows` in index.css).
          return (
            <ul
              className={
                tiles
                  ? 'fill-rows course-tiles grid w-gap [grid-template-columns:repeat(auto-fit,minmax(min(100%,10em),1fr))]'
                  : 'fill-rows course-rows wide-grid [--col:15em]'
              }
              data-score={settings.showScore}
            >
              {courses.map((c) => (
                <li key={c.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => openLink(c.url)}
                    className={
                      tiles
                        ? 'course-tile flex h-full w-full flex-col gap-0.5 rounded-md border border-border p-2 text-left transition hover:-translate-y-0.5 hover:bg-surface-2'
                        : 'course-row flex h-full w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-surface-2'
                    }
                    style={
                      tiles
                        ? ({ borderTop: `4px solid ${c.color}`, '--c': c.color } as CSSProperties)
                        : undefined
                    }
                  >
                    {!tiles && (
                      <span
                        className="course-bar h-6 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: c.color }}
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 max-w-full flex-1">
                      <span className="course-name block truncate font-medium">{c.name}</span>
                      {(settings.showCode || settings.showTerm) && (
                        <span className="block truncate text-xs text-muted">
                          {[settings.showCode && c.code, settings.showTerm && c.term?.name]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </span>
                    {settings.showScore && c.grade.score !== null && (
                      <span className="shrink-0 text-xs font-semibold tabular-nums">
                        {c.grade.score.toFixed(0)}%
                      </span>
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
