# RILAN Roku Content Platform - TODO

## Database Schema
- [x] Extend drizzle/schema.ts with all tables: channels, videos, categories, video_categories, channel_videos, channel_categories, assets
- [x] Generate and apply migrations
- [x] Seed sample data (4 channels, 10 videos, 8 categories)

## Backend API Routers
- [x] Channel CRUD router (list, get, create, update, status toggle)
- [x] Video CRUD router (list, get, create, update, status, archive)
- [x] Category CRUD router (list, create, update)
- [x] Channel-video assignment router (assign, unassign, reorder, feature)
- [x] Channel-category row router (assign, reorder, show/hide)
- [x] Branding asset router (upload, list, delete per channel)
- [x] Feed generator router (generate Roku Direct Publisher JSON)
- [x] Feed preview router (preview + validation)
- [x] Public feed endpoint (GET /api/roku/feed/:slug.json)
- [x] Dashboard stats router

## Admin Panel - Layout & Navigation
- [x] Dark/professional admin theme in index.css
- [x] DashboardLayout with sidebar navigation
- [x] App.tsx with all routes registered
- [x] Auth guard (redirect to login if not authenticated)

## Admin Panel - Pages
- [x] Login page
- [x] Dashboard page (stats: channels, videos, published, drafts, warnings)
- [x] Channels list page (search, create, activate/deactivate)
- [x] Channel detail/edit page (metadata, theme, feature flags)
- [x] Videos list page (search, filter by status, paginate)
- [x] Video create/edit page (all metadata fields, channel/category assignment)
- [x] Categories page (list, create, edit)
- [x] Channel-category row management page (assign, reorder, show/hide)
- [x] Branding page (upload logo, splash, icons per channel)
- [x] Feed preview page (raw JSON + human-readable + validation results)
- [x] Publishing page (approve, publish/unpublish, schedule window)

## Feed Generator
- [x] Roku Direct Publisher JSON feed format implementation
- [x] Feed validation logic (title, thumbnail, streamUrl, duration checks)
- [x] Public feed URL hosting (/api/roku/feed/:slug.json)
- [x] Feed config endpoint (/api/roku/config/:slug.json)
- [x] Status filter (only published videos appear in feed)
- [x] Content-type routing (movie vs short-form)

## Testing
- [x] validateVideo unit tests (8 cases)
- [x] generateRokuFeed unit tests (8 cases)
- [x] generateValidationReport unit tests (6 cases)
- [x] auth.logout regression test
- [x] All 24 tests passing

## Documentation
- [x] Setup instructions in Publishing page
- [x] Roku Direct Publisher integration guide
