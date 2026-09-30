# ADR 0001: Use CSS Modules instead of Tailwind

- **Status:** Accepted
- **Date:** 2026-09-29

## Context

The existing UI used utility-class names, but Tailwind's `content` list was empty and no generated stylesheet was imported. That made styling dependent on an unverified build path. The rebuild also needs a small static-hosted bundle and predictable styling without a runtime styling system.

## Decision

Use Vite's built-in CSS Modules (`*.module.css`) for component styles and one small global stylesheet for reset, typography, and focus treatment. Do not add Tailwind.

## Consequences

- Styles are scoped to their component, with no utility-generation scan or PostCSS pipeline to maintain.
- Responsive rules, contrast, and visible focus remain ordinary CSS and can be inspected in the built asset.
- A future shared design system may extract tokens, but that is not needed for this app.
- Styling quality still requires accessibility and browser testing; CSS Modules do not guarantee contrast or responsiveness by themselves.
