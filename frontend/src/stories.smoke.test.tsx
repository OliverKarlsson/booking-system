import type { ComponentType } from 'react';
import { cleanup, render } from '@testing-library/react';
import { composeStories, setProjectAnnotations } from '@storybook/react';
import { afterEach, describe, expect, it } from 'vitest';

import * as previewAnnotations from '../.storybook/preview';

/**
 * Renders every story, once.
 *
 * This exists because of a bug it would have caught: `DashboardUnitCard` renders a
 * `<Link>`, react-router's hooks throw outside a Router, and every story for that
 * component failed at render — while `build-storybook` succeeded and the dev server happily
 * listed them in the sidebar. Compiling a story and indexing it prove neither that it
 * renders nor that the decorators it needs are in place.
 *
 * The stories carry the interesting states (a guest checking out today, a back-to-back
 * changeover, a conflict whose details are unusable), so this doubles as cheap coverage of
 * those branches. It deliberately asserts nothing beyond "it rendered and produced
 * output" — behaviour belongs in the tests beside each component, and duplicating those
 * assertions here would mean two places to update for one change.
 *
 * `setProjectAnnotations` applies .storybook/preview, so stories are rendered through the
 * same decorators Storybook uses. Without it this would pass while the real Storybook
 * still threw.
 */
setProjectAnnotations(previewAnnotations);

const storyModules = import.meta.glob('./**/*.stories.tsx', { eager: true }) as Record<
  string,
  Parameters<typeof composeStories>[0]
>;

afterEach(cleanup);

const entries = Object.entries(storyModules);

describe('storybook stories', () => {
  it('finds story files to render', () => {
    // Guards against the glob silently matching nothing after a move — an empty suite
    // reports success just as loudly as a passing one.
    expect(entries.length).toBeGreaterThan(0);
  });

  describe.each(entries)('%s', (_path, storyModule) => {
    // composeStories' return type is keyed to each module's own exports, which cannot be
    // expressed while iterating a heterogeneous glob. The runtime shape is uniform:
    // story name → renderable component.
    const composed = composeStories(storyModule) as unknown as Record<string, ComponentType>;

    it.each(Object.keys(composed))('renders %s', (storyName) => {
      const Story = composed[storyName];

      // Asserting only that rendering completes, not that it produced markup. Some
      // components render nothing on purpose — Pagination returns null at one page, since
      // controls for a list that cannot be paged are noise — and a story documenting that
      // is exactly as valid as one showing a full component.
      expect(() => render(<Story />)).not.toThrow();
    });
  });
});
