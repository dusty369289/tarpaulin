import { GraduationCap } from 'lucide-react';
import type { CSSProperties } from 'react';
import { z } from 'zod';
import { useCanvas } from '../canvas/CanvasProvider';
import { useCatalog, useCatalogStatus, useCourseIds } from '../canvas/hooks';
import { courseFilter, field } from './settings/fields';
import { CourseDot, EmptyState, QueryGate } from './shared/ui';
import { defineWidget } from './types';

const schema = z.object({
  courseIds: courseFilter(),
  display: field(z.enum(['score', 'grade', 'both']).default('score'), {
    label: 'Show',
    options: { score: 'Percentage', grade: 'Letter grade', both: 'Both' },
  }),
  sortBy: field(z.enum(['name', 'score']).default('name'), { label: 'Sort by' }),
  showBars: field(z.boolean().default(true), { label: 'Show progress bars' }),
  hideUngraded: field(z.boolean().default(true), { label: 'Hide courses with no grade yet' }),
  warnBelow: field(z.number().int().min(0).max(100).default(40), {
    label: 'Highlight scores below',
    unit: '%',
    help: 'Set to 0 to turn off.',
  }),
});

export const Grades = defineWidget({
  type: 'grades',
  name: 'Grades',
  description: 'Current score in each course, straight from your Canvas gradebook.',
  icon: GraduationCap,
  defaultSize: { w: 4, h: 7 },
  minSize: { w: 2, h: 3 },
  settingsSchema: schema,
  Component: function GradesWidget({ settings }) {
    const catalog = useCatalog();
    const status = useCatalogStatus();
    const ids = useCourseIds(settings.courseIds);
    const { openLink } = useCanvas();

    return (
      <QueryGate queries={[status]}>
        {() => {
          let courses = catalog.inScope.filter((c) => ids.includes(c.id));
          if (settings.hideUngraded) courses = courses.withGrades();
          courses =
            settings.sortBy === 'score'
              ? courses.sortBy((c) => -(c.grade.score ?? -1))
              : courses.byName();
          if (courses.isEmpty) return <EmptyState>No grades to show yet.</EmptyState>;
          return (
            // Courses flow into columns when wide; rows share any spare height, and roomy cells
            // turn into cards with a big score (`.grades` in index.css).
            <ul className="fill-rows grades wide-grid [--col:15em]" data-bars={settings.showBars}>
              {courses.map((course) => {
                const { grade } = course;
                const low = grade.isLow(settings.warnBelow);
                return (
                  <li key={course.id} className="grade-cell">
                    <button
                      type="button"
                      onClick={() => openLink(grade.url)}
                      className="grade-btn block w-full text-left"
                    >
                      <div className="grade-row flex items-center gap-2">
                        <CourseDot color={course.color} />
                        <span className="min-w-0 flex-1 truncate">{course.name}</span>
                        <span
                          className={`grade-score shrink-0 tabular-nums font-semibold ${low ? 'text-danger' : ''}`}
                          style={
                            { '--len': grade.format(settings.display).length } as CSSProperties
                          }
                        >
                          {grade.format(settings.display)}
                        </span>
                      </div>
                      {settings.showBars && (
                        <div
                          className="grade-bar mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"
                          aria-hidden
                        >
                          <div
                            className="h-full rounded-full transition-[width] duration-500"
                            style={{
                              width: `${grade.barPercent}%`,
                              backgroundColor: low ? 'rgb(var(--danger))' : course.color,
                            }}
                          />
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          );
        }}
      </QueryGate>
    );
  },
});
