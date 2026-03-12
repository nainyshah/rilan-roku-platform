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

## Bulk CSV Video Import
- [x] Backend: CSV parse + validate procedure (title, streamUrl, thumbnailUrl, durationSeconds, contentType, contentRating, releaseDate, tags, channelSlug, categorySlug)
- [x] Backend: Bulk insert procedure with duplicate slug detection and per-row error reporting
- [x] Backend: CSV template download endpoint
- [x] Frontend: Import page with drag-and-drop CSV upload
- [x] Frontend: Parsed row preview table with per-row validation status
- [x] Frontend: Channel + category assignment selector before import
- [x] Frontend: Import progress and results summary (imported / skipped / errors)
- [x] Navigation: Add "Import Videos" link to sidebar under Videos
- [x] Tests: CSV parse and bulk import unit tests (11 tests passing)

## Import History Log
- [x] DB: Add import_logs table (id, filename, csvS3Key, csvUrl, importedCount, skippedCount, duplicateCount, errorCount, totalRows, resultsJson, importedBy, createdAt)
- [x] DB: Generate and apply migration SQL
- [x] Backend: Store original CSV to S3 on every bulkImport call
- [x] Backend: Write import log record after each bulk import
- [x] Backend: tRPC procedures — list, getById, delete import logs
- [x] Backend: Signed/direct CSV re-download URL from S3
- [x] Frontend: Import History page with sortable log table
- [x] Frontend: Log detail drawer (per-row results, re-download CSV button)
- [x] Frontend: Delete log entry with confirmation
- [x] Navigation: Add "Import History" link to sidebar
- [x] Tests: Import log unit tests (10 tests passing)

## Scheduled Publish Windows
- [x] Backend: Feed generator filters channel_videos by publishFrom/publishTo (UTC now)
- [x] Backend: tRPC procedure to set/clear publishFrom + publishTo on a channel_video assignment
- [x] Backend: tRPC query to get schedule for a specific channel_video assignment
- [x] Frontend: Date-range picker component on ChannelDetail video assignment rows
- [x] Frontend: Show active schedule badge (Scheduled / Expires) on assigned video rows
- [x] Frontend: Schedule indicator on Videos list page (shows if video has any active schedule)
- [x] Frontend: Feed Preview shows schedule-filtered video count vs total
- [x] Tests: Schedule filter unit tests (9 tests passing, 54 total)

## Re-import from History
- [x] Backend: getReimportData procedure — fetch CSV from S3 by log ID, return as base64 string + filename
- [x] Frontend: ImportVideos page accepts ?reimportLogId= query param to auto-load a stored CSV
- [x] Frontend: On mount with reimportLogId, call getReimportData, decode base64 → File object, trigger parse
- [x] Frontend: Show "Re-importing from: [filename]" banner when in re-import mode
- [x] Frontend: Re-import button in ImportHistory detail drawer with loading state
- [x] Frontend: After re-import completes, navigate to Import History to show new log entry
- [x] Tests: Re-import procedure unit test (5 tests: not found, no CSV, success, S3 fallback, fetch error)

## Thumbnail URL Validation During Import
- [x] Backend: thumbnailValidator helper — HTTP HEAD check with 5s timeout, classify errors (404, timeout, non-image content-type, network error)
- [x] Backend: parsePreview procedure runs thumbnail checks in parallel (Promise.allSettled) and attaches warnings to each row
- [x] Backend: Validation summary in parsePreview response (total warnings, broken count, unreachable count)
- [x] Backend: Skip thumbnail check for rows that already have schema validation errors (fail fast)
- [x] Frontend: Warning badge on preview table rows with broken thumbnails
- [x] Frontend: Expandable warning detail (URL, HTTP status, error type) per row
- [x] Frontend: Summary banner above preview table showing total thumbnail warnings
- [x] Frontend: Option to proceed with import despite warnings (with confirmation)
- [x] Tests: thumbnailValidator unit tests — 22 tests (ok, 404, 410, 403, 401, 500, bad_content, HEAD→GET fallback, timeout, network error, invalid_url, batch dedup, mixed results, escalation logic)

## Feed Cache (5-minute TTL)
- [x] Backend: feedCache.ts module — in-memory Map with per-slug TTL entries, get/set/invalidate/purge
- [x] Backend: Cache hit/miss logged to console with slug + age
- [x] Backend: Feed REST endpoint (/api/roku/feed/:slug.json) reads from cache; regenerates on miss/expiry
- [x] Backend: Cache invalidated on channel update, video publish/archive, or assignment change
- [x] Backend: Admin tRPC procedures (feed.cacheStatus, feed.purgeCache, feed.invalidateCache)
- [x] Frontend: Publishing page shows cache status (cached / expires in Xs / not cached) per channel
- [x] Tests: feedCache unit tests — 16 tests (set, get hit, get miss/expired, invalidate, purge all, stats, TTL reset)

## Bulk Video Status Update
- [x] Backend: videos.bulkUpdateStatus tRPC procedure (ids[], newStatus: published|draft|archived)
- [x] Frontend: Videos list — checkbox column (select all / select row)
- [x] Frontend: Videos list — floating bulk action bar appears when ≥1 video selected
- [x] Frontend: Bulk action bar — "Change Status" dropdown (Publish / Draft / Archive) with confirm dialog
- [x] Frontend: Bulk action bar — shows selected count, deselect-all button
- [x] Frontend: Optimistic update on bulk status change, invalidate list on settle
- [x] Tests: included in roku.test.ts (existing test suite covers status updates)

## Stream URL Validation During Import
- [x] Backend: streamUrlValidator.ts — checkStreamUrl() HTTP HEAD/GET fallback, classify (ok/ok_unknown_type/not_found/forbidden/bad_content/timeout/network_error/invalid_url/server_error)
- [x] Backend: parsePreview procedure — validateStreamUrls flag; runs stream checks in parallel alongside thumbnail checks
- [x] Backend: Per-row streamCheck result attached; row escalated to warning on failure
- [x] Backend: streamValidation summary in parsePreview response (checked/warnings/skipped counts)
- [x] Frontend: ImportVideos — validateStreamUrls checkbox toggle (separate from thumbnails)
- [x] Frontend: Stream URL column in preview table with StreamStatusCell badge
- [x] Frontend: Stream warning summary banner (separate from thumbnail banner)
- [x] Tests: streamUrlValidator unit tests — 25 tests (ok/HLS/DASH/no-CT/unknown-type/bad-content/404/410/403/401/500/timeout/network-error/invalid-URL/HEAD→GET/batch-dedup/mixed)
