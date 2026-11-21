# Ngx BOS Agent Guide

Ngx BOS is an Angular 22 CRM and business operating system SPA.

This file must work in delivered business apps after source-only folders are removed.

Do not rely on source-workspace-only folders existing after this template is copied into a business
repo.

## Hard Rules

- Treat the app as browser-only SPA software.
- Do not add SSR, prerender, static SEO, or landing-page-first assumptions unless explicitly asked.
  The production build only emits a minimal `sitemap.xml` / `robots.txt` for `/sign` via
  `tools/seo/generate-static-seo.mjs`; do not extend it into an SEO workflow.
- The app is zoneless (`provideZonelessChangeDetection()`). Do not import `zone.js`. Use
  `provideAppInitializer()` for initializers (as `src/app/app.formcomponents.ts` does); do not add
  legacy `APP_INITIALIZER` providers.
- Keep business-specific routes, roles, schemas, dashboards, integrations, environment values, and
  workflow copy app-owned under `src/`.
- Put reusable BOS contracts and behavior in `@wawjs/ngx-bos` when code is moved to the package.
- Import reusable package APIs from `@wawjs/ngx-bos`, not from package-internal source paths.
- Keep Angular 22 standalone, default OnPush, signals, native control flow, and token-based styling
  conventions.
- Use Angular Signal Forms (`@angular/forms/signals`) for all form work; do not add Reactive or template-driven forms.
- Keep project-specific form components registered through `src/app/app.formcomponents.ts`.
- Use `LanguageService` / `TranslateService` from `@wawjs/ngx-translate` directly for language
  switching.

## Release Discipline

- Never run `npm publish` or any package-release command against `@wawjs/*` packages. Version bumps and
  publishing are the developer's responsibility, always done manually.
- Update source only. Do not bump `package.json` versions, build publishable artifacts, or publish
  (in the source workspace this also applies to fixes ported back into `projects/ngx-bos`).
- Never `git commit` or `git push` unless the developer explicitly asks for it in that instance.

## Build And Validation

- `npm start`: dev server; proxies `/api` and `/waw` to `http://localhost:8080` (`proxy.conf.json`).
- `npm run build`: production build plus the `/sign` sitemap/robots step.
- There are no tests.

## Firestore

- Each app has its own Firebase project (`environment.firebase`, `.firebaserc`; `ngx-bos` for the
  template) and uses its `(default)` Firestore database (`environment.firestoreDatabase`). Never
  share a Firebase project or database with another app: its rules would replace this app's rules.
- Its rules and indexes live in this repo: `firestore.rules`, `firestore.indexes.json`, wired in
  `firebase.json`. Deploy the rules and indexes with `npm run rules` (needs the global `firebase` CLI, signed
  in with an account that has access to the project).
- Admins match by Firebase uid or by verified Google email. The uid and email lists in
  `firestore.rules` must match `environment.admins`.

## Optional Package Guidance

If dependencies are installed, reusable package guidance may be available at:

```text
node_modules/@wawjs/ngx-bos/ai/
```

Also check the installed WAW package docs that match the APIs being changed:

```text
node_modules/@wawjs/ngx-ace/README.md
node_modules/@wawjs/ngx-core/README.md
node_modules/@wawjs/ngx-crud/README.md
node_modules/@wawjs/ngx-fabric/README.md
node_modules/@wawjs/ngx-form/README.md
node_modules/@wawjs/ngx-http/README.md
node_modules/@wawjs/ngx-map/README.md
node_modules/@wawjs/ngx-socket/README.md
node_modules/@wawjs/ngx-tinymce/README.md
node_modules/@wawjs/ngx-translate/README.md
node_modules/@wawjs/ngx-ui/README.md
```

This path is optional guidance only. The rules in this file remain valid on their own.
