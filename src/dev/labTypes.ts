export interface LabCase {
  type: string;
  w: number;
  h: number;
  settings?: Record<string, unknown>;
  data?: unknown;
  editMode?: boolean;
}

export interface LabIssue {
  kind:
    'horizontal-scroll' | 'escapes-frame' | 'squashed' | 'vertical-scroll' | 'clipped' | 'empty';
  detail: string;
}

export interface LabReport extends LabCase {
  px: { width: number; height: number };
  issues: LabIssue[];
  /** Ms from render to settled. */
  settleMs: number;
}

declare global {
  interface Window {
    __tarpaulinLab?: {
      types: string[];
      minSize: (type: string) => { w: number; h: number };
      render: (c: LabCase) => Promise<LabReport>;
      /** Switches Settings › Mode ('light', 'dark', 'high-contrast', 'system'); resolves to the
       *  applied light/dark mode once the page has settled. */
      setTheme: (theme: string) => Promise<string>;
      sweep: (cases: LabCase[]) => Promise<LabReport[]>;
    };
    __tarpaulin?: {
      settled: (opts?: { quietFrames?: number; timeoutMs?: number }) => Promise<void>;
    };
  }
}
