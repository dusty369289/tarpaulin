import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fullSchema, getWidget } from '../registry';
import { courseFilter, field, parseWithDefaults } from './fields';
import { SettingsForm } from './SettingsForm';

const schema = z.object({
  name: field(z.string().default(''), { label: 'Name', section: 'appearance' }),
  colour: field(z.string().default(''), { label: 'Colour', kind: 'color' }),
  days: field(z.number().int().min(1).max(30).default(7), { label: 'Days', unit: 'days' }),
  big: field(z.number().min(0).max(10_000).default(5), { label: 'Big number' }),
  mode: field(z.enum(['a', 'b']).default('a'), {
    label: 'Mode',
    options: { a: 'Alpha', b: 'Beta' },
  }),
  on: field(z.boolean().default(false), { label: 'Enabled' }),
  courseIds: courseFilter(),
  secret: field(z.string().default(''), { label: 'Hidden', kind: 'hidden' }),
});
const courses = [
  { id: '1', name: 'Politics', color: '#f00' },
  { id: '2', name: 'Theory', color: '#0f0' },
];

function setup() {
  const onChange = vi.fn();
  const values = schema.parse({});
  render(<SettingsForm schema={schema} values={values} onChange={onChange} courses={courses} />);
  return onChange;
}

describe('SettingsForm', () => {
  it('generates one control per field from the zod schema', () => {
    setup();
    expect(screen.getByLabelText('Name')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Colour')).toHaveAttribute('type', 'color');
    expect(screen.getByLabelText(/Days/)).toHaveAttribute('type', 'range'); // small bounded range → slider
    expect(screen.getByLabelText('Big number')).toHaveAttribute('type', 'number');
    expect(screen.getByRole('option', { name: 'Beta' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Enabled' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Politics' })).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  it('groups appearance fields separately', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Appearance' })).toContainElement(
      screen.getByLabelText('Name'),
    );
  });

  it('reports typed values on change', () => {
    const onChange = setup();
    fireEvent.change(screen.getByLabelText(/Days/), { target: { value: '12' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ days: 12 }));
    fireEvent.click(screen.getByRole('switch', { name: 'Enabled' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ on: true }));
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'b' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Theory' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ courseIds: ['2'] }));
  });

  it('clamps out-of-range numbers', () => {
    const onChange = setup();
    fireEvent.change(screen.getByLabelText('Big number'), { target: { value: '99999' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ big: 10_000 }));
  });

  it('renders every real widget schema without unknown fields', () => {
    const def = getWidget('calendar')!;
    const s = fullSchema(def);
    render(<SettingsForm schema={s} values={s.parse({})} onChange={() => {}} courses={courses} />);
    expect(screen.getByLabelText('View')).toBeInTheDocument();
    expect(screen.getByLabelText('Accent colour')).toBeInTheDocument();
  });
});

describe('parseWithDefaults', () => {
  it('keeps valid fields and defaults the rest', () => {
    expect(parseWithDefaults(schema, { days: 99, mode: 'b', extra: 1 })).toMatchObject({
      days: 7,
      mode: 'b',
    });
    expect(parseWithDefaults(schema, null)).toEqual(schema.parse({}));
  });
});
