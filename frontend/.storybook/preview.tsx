import type { Preview } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';

// The app's own stylesheet, so stories render with the real Tailwind build and the same
// base layer the app gets — including the shared focus-visible ring. A story that styled
// itself differently from the app would be worse than no story.
import '../src/index.css';

const preview: Preview = {
  /**
   * A router around every story.
   *
   * Presentational components are props-only, but "props-only" does not mean
   * "context-free": DashboardUnitCard renders a `<Link>` to the unit's detail page, and
   * react-router's hooks throw outside a Router — the story compiles and indexes fine and
   * then fails at render.
   *
   * Applied globally rather than per-story so a component that grows a link later does not
   * silently break its own stories. MemoryRouter keeps navigation in memory, so clicking a
   * link inside a story is inert rather than reloading the Storybook shell.
   */
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],

  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    // Matches `body` in index.css. Storybook's default canvas is white, which would hide
    // the contrast between the page background and the white cards that sit on it.
    backgrounds: {
      default: 'app',
      values: [
        { name: 'app', value: '#f8fafc' },
        { name: 'white', value: '#ffffff' },
      ],
    },
    a11y: {
      // Report violations rather than failing the story: some are only meaningful in a
      // full page (landmark structure, heading order), and a primitive rendered in
      // isolation cannot satisfy them without inventing a page around it.
      test: 'todo',
    },
  },
};

export default preview;
