// Shared building blocks. Anything that appears in more than one place (a settings row, an
// on/off switch, a search box, a folded list, a banner) lives here, so the app stays consistent
// and a change to one control changes it everywhere. Base classes (.btn, .input, .card, .chip…)
// are in src/index.css.
export { Banner } from './Banner';
export { FoldedList } from './FoldedList';
export { Row, Section } from './layout';
export { SearchInput } from './SearchInput';
export { Switch } from './Switch';
