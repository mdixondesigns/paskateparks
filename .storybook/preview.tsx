import "../src/app/globals.css";

import type { Preview } from "@storybook/nextjs-vite";

const preview: Preview = {
  tags: ["autodocs"],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: "todo",
    },
    // App Router mocks for components using next/navigation (usePathname,
    // useRouter, <Link>). Default pathname is a park page rather than "/" —
    // Footer.tsx hides itself on the homepage, so a non-homepage default
    // means every story renders the "normal" chrome unless it overrides
    // this per-story (see Footer.stories.tsx for the homepage case).
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/park/fdr-skatepark" },
    },
    // Every park component renders inside the cream body per VISUAL-DESIGN.md
    // §3 — match that here instead of Storybook's default white canvas so
    // colors/contrast read the way they will on the real site.
    backgrounds: {
      default: "cream",
      values: [
        { name: "cream", value: "#FAF6EC" },
        { name: "ink", value: "#1A1612" },
        { name: "white", value: "#FFFFFF" },
      ],
    },
  },
};

export default preview;
