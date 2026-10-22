// Shared building blocks. Anything that appears in more than one place (a settings row, an
// on/off switch, a search box, a folded list, a banner, a radio group, a confirmation, a key
// cap, a dialog backdrop) lives here, so the app stays consistent and a change to one control
// changes it everywhere. Keyboard helpers are in keys.ts. Base classes (.btn, .input, .card,
// .chip, .kbd…) are in src/index.css. Modal and Drawer are in src/app/Modal.tsx and share
// useDialog's focus handling and the Backdrop.
export { Backdrop } from './Backdrop';
export { Banner } from './Banner';
export {
  ConfirmDialog,
  useConfirm,
  type ConfirmAction,
  type ConfirmOptions,
} from './ConfirmDialog';
export { FoldedList } from './FoldedList';
export { Kbd } from './Kbd';
export { matchesQuery, Row, Section, SettingsFilter, useNoRows, useSettingsFilter } from './layout';
export { Radio, RadioGroup } from './RadioGroup';
export { SearchInput } from './SearchInput';
export { Switch } from './Switch';
export { tabbables, useDialog } from './useDialog';
