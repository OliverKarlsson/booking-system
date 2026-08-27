import type { Meta, StoryObj } from '@storybook/react';

import { Badge } from './Badge';
import { Button } from './Button';
import { Card, CardBody, CardFooter, CardHeader } from './Card';

const meta = {
  title: 'Primitives/Card',
  component: Card,
  parameters: { layout: 'padded' },
  // Card requires `children`; every story below composes its own, so this only satisfies
  // the type and is always overridden by `render`.
  args: { children: null },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <Card className="max-w-md">
      <CardBody>A plain card. The surface everything else sits on.</CardBody>
    </Card>
  ),
};

export const WithHeader: Story = {
  render: () => (
    <Card className="max-w-md">
      <CardHeader title="Gamla Stan Studio" subtitle="Stockholm, SE" />
      <CardBody>Body content.</CardBody>
    </Card>
  ),
};

/** Header actions and a status badge — the shape the dashboard's unit cards take. */
export const WithActionsAndBadge: Story = {
  render: () => (
    <Card className="max-w-md">
      <CardHeader
        title="Gamla Stan Studio"
        subtitle="Stockholm, SE"
        actions={<Badge tone="success">Occupied</Badge>}
      />
      <CardBody>Johan Ek · checks out 30 Aug 2026</CardBody>
      <CardFooter>
        <Button size="sm" variant="secondary">
          View
        </Button>
      </CardFooter>
    </Card>
  ),
};
