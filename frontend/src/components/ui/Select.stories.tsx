import type { Meta, StoryObj } from '@storybook/react';

import { Select } from './Select';

const units = [
  { value: 'a', label: 'Gamla Stan Studio' },
  { value: 'b', label: 'Brooklyn Garden Apartment' },
  { value: 'c', label: 'Waiheke Vineyard Cabin' },
];

const meta = {
  title: 'Primitives/Select',
  component: Select,
  args: { label: 'Rental unit', options: units, placeholder: 'Choose a unit' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithHint: Story = { args: { hint: 'Only active units are listed.' } };
export const WithError: Story = { args: { error: 'Select a rental unit' } };

/**
 * The unit picker is disabled when editing an existing reservation. Moving a booking
 * between properties is a cancel-and-rebook rather than an edit: the update schema omits
 * rentalUnitId entirely, because the new unit's availability is a different question from
 * the one already answered for this one.
 */
export const DisabledOnEdit: Story = {
  args: {
    disabled: true,
    defaultValue: 'a',
    hint: 'To move this stay to another property, cancel it and book again.',
  },
};

/**
 * The timezone picker, and the reason it is filtered.
 *
 * The API validates against Node's ICU list, which omits `UTC` and `Etc/*`; browsers list
 * `UTC`. An unfiltered select would therefore offer an option the API answers with a 400 —
 * a field that is valid on screen and rejected on submit.
 */
export const TimezonePicker: Story = {
  args: {
    label: 'Timezone',
    hint: 'The property\u2019s local time. Occupancy is decided by the flat\u2019s calendar, not yours.',
    defaultValue: 'Europe/Stockholm',
    options: [
      { value: 'Europe/Stockholm', label: 'Europe/Stockholm' },
      { value: 'Europe/Lisbon', label: 'Europe/Lisbon' },
      { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
      { value: 'Pacific/Auckland', label: 'Pacific/Auckland' },
    ],
  },
};
