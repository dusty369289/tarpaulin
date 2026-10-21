import { memo, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getWidget, normalizeSettings } from '../widgets/registry';
import type { FrameSettings } from '../widgets/shared/frame';
import { WidgetFrame } from '../widgets/shared/WidgetFrame';
import type { WidgetSize } from '../widgets/types';
import { ErrorBoundary } from './ErrorBoundary';
import type { WidgetInstance } from './types';

interface WidgetHostProps {
  id: string;
  instance: WidgetInstance;
  size: WidgetSize;
  editMode: boolean;
  onSettings?: (id: string) => void;
  onRemove?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onData: (id: string, data: unknown) => void;
}

/** Resolves a widget instance to its definition and renders it inside the shared frame. */
export const WidgetHost = memo(function WidgetHost({
  id,
  instance,
  size,
  editMode,
  onSettings,
  onRemove,
  onDuplicate,
  onData,
}: WidgetHostProps) {
  const def = getWidget(instance.type);
  const setData = useCallback((data: unknown) => onData(id, data), [id, onData]);
  if (!def) {
    return (
      <div className="card flex h-full items-center justify-center gap-2 p-3 text-sm text-muted">
        <AlertTriangle className="h-4 w-4" /> Unknown widget “{instance.type}”
      </div>
    );
  }
  const settings = normalizeSettings(instance.type, instance.settings) as FrameSettings &
    Record<string, unknown>;
  const { Component } = def;
  return (
    <WidgetFrame
      widgetId={id}
      columns={size.w}
      title={settings.title || def.name}
      icon={def.icon}
      frame={settings}
      editMode={editMode}
      onSettings={onSettings && (() => onSettings(id))}
      onRemove={onRemove && (() => onRemove(id))}
      onDuplicate={onDuplicate && (() => onDuplicate(id))}
    >
      <ErrorBoundary label={def.name}>
        <Component
          id={id}
          settings={settings}
          size={size}
          editMode={editMode}
          data={instance.data}
          setData={setData}
        />
      </ErrorBoundary>
    </WidgetFrame>
  );
});
