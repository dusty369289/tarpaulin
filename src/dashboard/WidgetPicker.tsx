import { Modal } from '../app/Modal';
import { widgetRegistry } from '../widgets/registry';

export function WidgetPicker({
  onPick,
  onClose,
}: {
  onPick: (type: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Add a widget" onClose={onClose} wide>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Object.values(widgetRegistry).map((def) => {
          const Icon = def.icon;
          return (
            <li key={def.type}>
              <button
                type="button"
                onClick={() => onPick(def.type)}
                className="flex h-full w-full items-start gap-3 rounded-theme border border-border p-3 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
              >
                <span className="rounded-md bg-accent/10 p-2 text-accent">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-medium">{def.name}</span>
                  <span className="block text-xs text-muted">{def.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
