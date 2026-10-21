import { z } from 'zod';
import { field } from '../settings/fields';

/** Appearance settings shared by every widget; merged into each widget's own schema. */
export const frameSchema = z.object({
  title: field(z.string().max(60).default(''), {
    label: 'Title',
    section: 'appearance',
    help: 'Leave empty for the default name.',
  }),
  accent: field(z.string().default(''), {
    label: 'Accent colour',
    kind: 'color',
    section: 'appearance',
  }),
  density: field(z.enum(['compact', 'comfortable', 'spacious']).default('comfortable'), {
    label: 'Density',
    section: 'appearance',
  }),
  // Style, paper and tilt have their own picker in the settings drawer (WidgetStylePicker).
  style: field(z.string().default(''), {
    label: 'Style',
    kind: 'hidden',
    help: 'Empty follows the page default.',
  }),
  paper: field(z.string().default('auto'), { label: 'Paper', kind: 'hidden' }),
  tilt: field(z.boolean().default(true), { label: 'Tilt', kind: 'hidden' }),
  background: field(z.enum(['surface', 'tinted', 'transparent']).default('surface'), {
    label: 'Fill',
    section: 'appearance',
  }),
  opacity: field(z.number().int().min(20).max(100).default(100), {
    label: 'Background opacity',
    section: 'appearance',
    unit: '%',
    step: 5,
  }),
  radius: field(z.enum(['theme', 'none', 'small', 'large']).default('theme'), {
    label: 'Corners',
    section: 'appearance',
  }),
  showHeader: field(z.boolean().default(true), { label: 'Show header', section: 'appearance' }),
});
export type FrameSettings = z.infer<typeof frameSchema>;
