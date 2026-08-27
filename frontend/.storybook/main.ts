import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook exists here as a presentation surface for the component layer, not as a
 * second test runner — behaviour is covered by the React Testing Library suites that sit
 * beside each component.
 *
 * What it earns: the container/presentational split is the frontend's main structural
 * decision, and a props-only view component is exactly the thing that is tedious to
 * demonstrate in a running app. Reaching "a unit whose next check-in is unknown" through
 * the real UI means seeding a database; here it is a story.
 *
 * Deliberately not containerised. It is a development and interview aid, so it runs from
 * `npm run storybook`; putting it in docker-compose would add an image to the stack that
 * no reviewer needs in order to run the product.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],

  addons: [
    '@storybook/addon-essentials',
    // The primitives carry real accessibility work — labelled inputs, aria-current in the
    // nav, aria-live on the spinner, focus management in the modal. The a11y addon audits
    // each story so those claims are checkable rather than asserted in a comment.
    '@storybook/addon-a11y',
  ],

  framework: {
    name: '@storybook/react-vite',
    options: {},
  },

  // Reuses frontend/vite.config.ts, so stories resolve @booking/shared through the same
  // workspace link and commonjs handling the app build uses. Without that inheritance the
  // shared Zod schemas would fail to resolve here but work everywhere else.
  core: { disableTelemetry: true },
};

export default config;
