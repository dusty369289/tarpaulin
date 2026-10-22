import { useCatalog } from '../../canvas/hooks';
import { FoldedList, Row, Section, SelectRow } from '../../ui';
import { useSettings } from '../settingsStore';

export function CoursesSettings() {
  const catalog = useCatalog();
  const courseScope = useSettings((s) => s.courseScope);
  const nicknames = useSettings((s) => s.courseNicknames);
  const update = useSettings((s) => s.update);
  const setCourseColor = useSettings((s) => s.setCourseColor);
  const setCourseNickname = useSettings((s) => s.setCourseNickname);
  const toggleCourseHidden = useSettings((s) => s.toggleCourseHidden);
  const term = catalog.currentTerm;
  return (
    <Section>
      <SelectRow
        label="Show courses from"
        help={
          term
            ? `Current term looks like ${term}. Hide single courses below.`
            : 'Hide single courses below.'
        }
        keywords="term"
        value={courseScope}
        options={[
          ['all', 'All courses'],
          ['current', 'Current term only'],
        ]}
        onChange={(courseScope) => update({ courseScope })}
      />
      <Row
        stacked
        label="Your courses"
        help="A colour and a nickname for each course, or hide it everywhere."
        keywords="colour color nickname rename hide show"
      >
        <FoldedList
          items={catalog.scoped.byName().toArray()}
          itemKey={(c) => c.id}
          noun="courses"
          searchText={(c) => `${c.canvasName} ${c.name} ${c.code ?? ''} ${c.term?.name ?? ''}`}
          renderItem={(c) => {
            const hidden = c.isHidden;
            const nickname = nicknames[c.id] ?? '';
            return (
              <div
                className={`flex flex-wrap items-center gap-2 py-2 ${hidden ? 'opacity-50' : ''}`}
              >
                <input
                  type="color"
                  aria-label={`Colour for ${c.canvasName}`}
                  value={c.color}
                  onChange={(e) => setCourseColor(c.id, e.target.value)}
                  className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent"
                />
                <div className="min-w-0 flex-1">
                  <input
                    // Remounts when the saved nickname changes underneath (a reset or an import).
                    key={nickname}
                    aria-label={`Nickname for ${c.canvasName}`}
                    className="input py-1"
                    placeholder={c.canvasName}
                    defaultValue={nickname}
                    onBlur={(e) => setCourseNickname(c.id, e.target.value)}
                  />
                  <div className="mt-0.5 truncate text-xs text-muted">
                    {c.canvasName} · {c.term?.name ?? 'No term'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn px-2 py-1 text-xs"
                  onClick={() => toggleCourseHidden(c.id)}
                >
                  {hidden ? 'Show' : 'Hide'}
                </button>
              </div>
            );
          }}
        />
      </Row>
    </Section>
  );
}
