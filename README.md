# Portfolio Frontend

React + TypeScript + Vite portfolio frontend with admin panels, learning tracker, and contact workflow.

## Documentation

Detailed documentation for the learning tracker module can be found in [LEARNING_MODULE.md](file:///c:/Users/VAIBHAV/MERN%20Portfolio%20Tracker/react-portfolio-frontend/docs/LEARNING_MODULE.md).

## Scripts

- `npm run dev` - Start local development server.
- `npm run build` - Type-check and build for production.
- `npm run preview` - Preview production build.
- `npm run lint` - Run ESLint checks.

## Architecture Map

```text
src/
  app/
    providers/       # Global providers composition (theme/admin/chatbot)
    router/          # Route table + lazy-loaded route setup
  layouts/           # Shared layout shells (navbar/main/chatbot wrapper)
  constants/         # Static UI constants (navigation/social links)
  components/
    admin/           # Admin tab sections
    home/            # Home page feature blocks
    learning/        # Learning module UI blocks
    ChatBot/         # Chat bot widgets
    ...              # Reusable shared components
  context/           # Global state/context providers
  hooks/             # Data hooks
  pages/             # Route-level pages
  types/             # Shared TypeScript types
  utils/             # API clients/config helpers
```

## Routing

- Centralized in `src/app/router/AppRoutes.tsx`.
- Route-level lazy loading is enabled for better initial load performance.
- `ProtectedRoute` wraps admin-only pages.

## Styling

- Tailwind CSS is the primary styling system.
- Global styles live in `src/index.css`.
- Avoid ad hoc global CSS files unless truly shared and cross-page.

## Accessibility Baseline

- Skip link to main content is enabled in layout.
- Primary navigation uses semantic `nav` and `aria-current`.
- Form feedback uses live regions for success/error messaging.
- External links use `rel="noopener noreferrer"`.

## Maintenance Guidelines

- Keep route-level logic in `pages/`; move reusable UI into `components/`.
- Keep static content/config (like nav links) in `constants/`.
- Add API types in `src/types` first, then consume in `utils`/`hooks`.
- Prefer incremental refactors; avoid large structural rewrites without need.

## Production Notes

- Build and lint should pass before deploy.
- If bundle size grows, prefer lazy loading and shared component extraction first.
