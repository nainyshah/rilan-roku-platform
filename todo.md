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

## Redis Feed Cache + Roku Webhooks
- [x] Backend: Install ioredis, add REDIS_URL secret (Upstash TLS)
- [x] Backend: redisFeedCache.ts — get/set/invalidate/purge with Redis TTL (5-min default)
- [x] Backend: Fallback to in-memory cache when Redis is unavailable
- [x] Backend: Feed REST endpoint uses Redis cache (HIT/MISS headers preserved)
- [x] DB: webhook_configs table (id, channelId, url, secret, events, active, createdAt)
- [x] DB: webhook_deliveries table (id, webhookId, event, payload, statusCode, responseBody, attempt, deliveredAt)
- [x] DB: Generate and apply migration SQL
- [x] Backend: webhookDispatcher.ts — fire POST to webhook URL with HMAC-SHA256 signature header
- [x] Backend: Retry logic (3 attempts, exponential backoff) with delivery log
- [x] Backend: Trigger webhook on feed invalidation (feed.invalidateCacheAndNotify procedure)
- [x] Backend: tRPC procedures — list, create, update, delete webhook configs
- [x] Backend: tRPC procedure — test-fire a webhook (sends a test ping payload)
- [x] Backend: tRPC procedure — list delivery logs per webhook + channelDeliveries
- [x] Frontend: Webhooks page — channel selector, webhook cards with events/secret/status
- [x] Frontend: Add/edit webhook dialog (URL, secret, events checkboxes, active toggle)
- [x] Frontend: Delivery log (per-webhook collapsible + channel-wide panel)
- [x] Frontend: Test-fire button with HTTP status feedback toast
- [x] Frontend: Signature verification code snippet card
- [x] Navigation: Webhooks added to sidebar under Publishing section
- [x] Tests: 12 new tests — Redis cache mock (4), signPayload/verifySignature (4), dispatchWebhooks (2), router structure (2)

## Tag Filter Chips on Videos List
- [x] Backend: videos.allTags tRPC query — return distinct tags across all videos
- [x] Frontend: Tag chip row above Videos table (all-tags loaded, toggle to filter)
- [x] Frontend: Active chips highlighted, clear-all button, chip count badge
- [x] Frontend: Filter applied client-side (AND logic, case-insensitive)

## Redis Cache Status on Publishing Page
- [x] Backend: feed.channelCacheStatuses tRPC query — return cache age + hit count per channel slug
- [x] Frontend: Publishing page — per-channel cache badge (HIT age / MISS / stale)
- [x] Frontend: "Force Refresh" button per channel — calls feed.invalidateCacheAndNotify, shows toast

## Channel/Category Override on Re-import
- [x] Frontend: ImportVideos — when in re-import mode, show override panel (channel selector + category selector)
- [x] Frontend: Override selections pre-filled from original log's defaultChannel/defaultCategory
- [x] Frontend: Override values passed to bulkImport mutation instead of the CSV-embedded defaults
- [x] Tests: 21 new tests (uxImprovements.test.ts) — tag filter x7, allTags logic x5, cache age display x4, re-import override x5
- [x] Total: 149 tests passing

## Server-Side Video Filtering
- [x] Backend: getVideos helper supports tags[], sortBy (createdAt|title|publishStatus), sortDir (asc|desc) at DB layer
- [x] Backend: videos.list procedure accepts and passes tags, sortBy, sortDir to getVideos
- [x] Frontend: Videos page sends tags/sortBy/sortDir as server-side query params (no client-side filtering)
- [x] Frontend: Sort controls (Title A-Z, Title Z-A, Newest, Oldest, Status) wired to server query
- [x] Frontend: Tag filter chips now trigger a server re-fetch instead of client-side filter
- [x] Tests: videos.list tests — tags pass-through, pagination total, status filter, search filter, invalid sortBy/sortDir rejected

## Webhook Delivery Dashboard
- [x] Backend: webhooks.allDeliveries tRPC query — returns all deliveries across all webhooks for a channel, sorted by deliveredAt desc
- [x] Backend: webhooks.retryDelivery tRPC mutation — re-dispatches a single failed delivery
- [x] Backend: webhooks.retryAllFailed tRPC mutation — retries all failed deliveries for a channel in parallel
- [x] Frontend: Webhooks page rebuilt with delivery monitoring dashboard (stats cards: total/success/failed/pending)
- [x] Frontend: Delivery log table with status badges, HTTP code, attempt count, timestamp
- [x] Frontend: "Retry Failed" button (retries all failed deliveries for the channel, shows count in toast)
- [x] Frontend: Per-row "Retry" button for individual failed deliveries
- [x] Frontend: Auto-refresh every 30s when deliveries are in pending/failed state

## Channel Statistics Panel
- [x] Backend: getChannelStats() DB helper — per-channel counts for video status, validation status, schedule windows, content rows
- [x] Backend: channels.stats tRPC query — returns full stats object, throws NOT_FOUND for invalid channelId
- [x] Frontend: ChannelStatsPanel component — 3 sections (Content Overview, Validation Status, Schedule Windows)
- [x] Frontend: StatCard sub-component with colored borders for at-a-glance health
- [x] Frontend: Statistics tab added as first tab on Channel Detail page (auto-refreshes every 60s)
- [x] Tests: channels.stats — full stats return, NOT_FOUND, non-positive channelId rejected, schedule breakdown
- [x] Total: 161 tests passing

## New Features (2026-03-24)
- [x] CMS Dashboard: real-time health check status indicator (polls /api/health every 60s, green/amber/red badge)
- [x] Channel Detail Branding: dedicated logo upload control (S3 upload, stored in brandingJson.logoUrl, shown in channel selector)
- [x] Roku: SettingsScene with Change Channel button (clears registry slug, relaunches ChannelSelectorScene)

## Enhancements (2026-03-24 batch 2)
- [x] Roku: Options menu entry for "Change Channel" (named entry in remote Options menu, not just gear icon)
- [x] CMS Channels list: 40x40 logo thumbnail next to channel name (fallback to initials avatar)
- [x] CMS Dashboard health indicator: rolling 24-hour uptime percentage next to status badge

## Enhancements (2026-03-24 batch 3)
- [x] CMS Dashboard: persist health check history in localStorage (uptime % survives page reloads)
- [x] Roku ChannelSelectorScene: render logo thumbnails from discovery endpoint (hdPosterUrl on ContentNode — already implemented in v7; confirmed no changes needed)
- [x] Roku CategoryScene + DetailsScene: Options menu with Settings + Change Channel entries

## UI/UX Fixes (2026-03-24)
- [x] Videos page: layout, filter bar, table density, empty state, bulk action bar polish
- [x] Import Videos page: stepper clarity, drag-drop zone, validation feedback, preview table
- [x] Import History page: table layout, detail drawer, re-import flow
- [x] Publishing page: channel cards, schedule picker, cache badge, approve/publish actions
- [x] Webhooks page: delivery dashboard layout, stats cards, log table, retry buttons

## Layout Overflow Fixes (2026-03-24)
- [x] ImportHistory: fix content overflowing outside DashboardLayout main area
- [x] ImportVideos: fix content overflowing outside DashboardLayout main area
- [x] Publishing: fix content overflowing outside DashboardLayout main area
- [x] Webhooks: fix content overflowing outside DashboardLayout main area

## Videos Layout Match (2026-03-25)
- [x] Videos page: remove own DashboardLayout wrapper (was double-nested), change space-y-4 to space-y-6, fix subtitle margin to match Channels page

## DashboardLayout De-duplication (2026-03-25)
- [x] ImportHistory: remove own DashboardLayout wrapper, normalize spacing to space-y-6
- [x] ImportVideos: remove own DashboardLayout wrapper, normalize spacing to space-y-6
- [x] Publishing: remove own DashboardLayout wrapper, normalize spacing to space-y-6
- [x] Webhooks: remove own DashboardLayout wrapper, normalize spacing to space-y-6

## New Features (2026-03-25)
- [x] ImportVideos: remove Back to Videos button
- [x] Webhooks: add Send Test button per webhook with backend tRPC procedure
- [x] AI Features: schema table for ai_jobs, backend procedures (enrich video, bulk enrich, generate tags, validate content)
- [x] AI Features: AI page with bulk enrichment, job history, and per-video AI panel
- [x] AI Features: wire AI enrich button into Videos table row actions
- [x] AI Features: add AI nav item to DashboardLayout sidebar

## AI Enhancements (2026-03-25 batch 2)
- [x] AI diff dialog: show original vs AI-suggested title/description/tags before saving
- [x] Videos bulk action bar: add Bulk AI Enrich option
- [x] AI Features job history: add Retry button for failed jobs

## AI Enhancements (2026-03-25 batch 3)
- [x] AI bulk enrich diff review: backend returns all suggestions without applying, frontend shows paginated diff dialog before saving
- [x] AI stream URL inference: detect content type (HLS/DASH/MP4/short-form) and suggest content rating from URL patterns
- [x] AI job history auto-polling: poll every 5s when any job is pending/running, stop when all complete

## AI Enhancements (2026-03-25 batch 4)
- [x] Bulk diff dialog: add Approve All Fields button
- [x] AI diff dialogs: display confidence score as colored badge per suggestion
- [x] AI Features page: wire channel-level bulk enrich to BulkDiffReviewDialog

## AI Enhancements (2026-03-25 batch 5)
- [x] Backend: ai.videoEnrichHistory tRPC query — return last enrichment job (date, confidence, jobId) per videoId
- [x] Frontend: Videos table Sparkles button — tooltip showing "Last AI enriched: X days ago · Confidence: N%" (or "Never enriched" if no history)

## Resilience Features (2026-03-26)
- [x] ReconnectToast: toast notification shown during tRPC retry attempts with attempt counter and auto-dismiss on recovery
- [x] GlobalErrorBoundary: upgrade ErrorBoundary to detect network exhaustion errors and show user-friendly "Unable to connect" UI with retry button
- [x] useHealthPolling: window focus listener that calls /api/health and invalidates all stale queries when the tab is refocused after being hidden

## Dashboard Resilience Enhancements (2026-03-26)
- [x] Last Synced timestamp: show in Dashboard header, updated by useHealthPolling on every successful refetch
- [x] Sidebar network-status banner: persistent WifiOff banner at top of sidebar when retry state is "failed"
- [x] 24h uptime in health badge: extend useHealthPolling to feed uptime % into Dashboard HealthBadge

## Dashboard Visual Enhancements (2026-03-26)
- [x] Uptime sparkline: 24h bar chart of green/red poll outcomes in Dashboard
- [x] Recovery notification: notifyOwner push when server transitions failed → recovered
- [x] Stale-data indicator: amber border + badge on stat cards when lastSyncedAt > 5 min old

## Operator Dashboard Features (2026-03-26)
- [x] Sparkline drill-down: slide-over panel with raw poll timestamps and latency per 30-min bucket
- [x] Configurable stale threshold: Settings page where operators set the stale-data warning boundary
- [x] Notification counter badge: Dashboard header badge counting recovery notifications sent this session

## Poll Interval Settings (2026-03-28)
- [x] usePollInterval hook: singleton with localStorage persistence (10s–300s)
- [x] Wire usePollInterval into useHealthPolling for live-reactive interval changes
- [x] Settings page: poll-interval Slider card with presets and live preview

## Custom Authentication System (2026-03-28)
- [x] DB schema: add password_hash, totp_secret, magic_link_token, password_changed_at columns
- [x] Auth helpers: bcrypt password hashing, JWT sign/verify, TOTP (otplib), magic-link token
- [x] tRPC auth router: login, logout, me, register (admin-only), change-password, request-magic-link, verify-magic-link, setup-totp, verify-totp, disable-totp
- [x] Admin seed script: seed initial admin user on server startup
- [x] Login page: email/password + TOTP 2FA step + magic-link tab
- [x] Change Password page with strength validation
- [x] Setup TOTP page with QR code and backup codes
- [x] User Management page (admin-only): create, list, update, reset password
- [x] PasswordExpiryBanner: 90-day expiry alert with days-remaining countdown
- [x] Replace all Manus OAuth references in App.tsx, DashboardLayout, const.ts
- [x] Vitest tests: 33 new tests for all auth helpers and logic

## Auth Follow-up Improvements (2026-03-28)
- [ ] Harden admin seed: random first-boot password, log once, force change on next login
- [ ] Add /users Administration group to DashboardLayout sidebar (admin-only)
- [ ] Wire Nodemailer SMTP email delivery for magic links

## Auth Follow-up Improvements (2026-03-28)
- [ ] Harden admin seed: random first-boot password, log once, force change on next login
- [ ] Add /users Administration group to DashboardLayout sidebar (admin-only)
- [ ] Wire Nodemailer SMTP email delivery for magic links

## Email Provider Migration (2026-03-28)
- [x] Replace Nodemailer with Resend SDK for magic-link and password-expiry email delivery
- [x] Add RESEND_API_KEY and RESEND_FROM environment variable support
- [x] Dev-mode fallback: log emails to console when RESEND_API_KEY is absent
- [x] Resend connectivity test (resend-connectivity.test.ts)

## Auth SDK Replacement (2026-03-28)
- [x] Replace sdk.authenticateRequest in context.ts with custom verifySessionJwt + DB lookup
- [x] Replace sdk.ts with a deprecated no-op stub
- [x] Replace oauth.ts with a no-op stub (registerOAuthRoutes does nothing)
- [x] Remove dead ENV fields: appId, oAuthServerUrl, ownerOpenId
- [x] Add ENV.appUrl for building absolute URLs (replaces oAuthServerUrl hack)
- [x] Fix routers.ts Roku getUrl to use ENV.appUrl
- [x] Remove ENV import from db.ts (ownerOpenId auto-admin fallback removed)
- [x] Write custom-auth-context.test.ts (JWT round-trip, SDK deprecation, ENV cleanup)

## Manus API Dependency Removal (2026-03-28)
- [x] Replace Forge LLM with OpenAI-compatible endpoint (OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL)
- [x] Replace Forge File Storage with AWS S3 SDK (S3_BUCKET, S3_REGION, S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_PUBLIC_BASE_URL)
- [x] Replace Forge Notifications with Resend email delivery (reuses existing RESEND_API_KEY + RESEND_FROM)
- [x] Stub out map.ts (no active usage in RILAN platform)
- [x] Stub out imageGeneration.ts (no active usage in RILAN platform)
- [x] Stub out voiceTranscription.ts (no active usage in RILAN platform)
- [x] Remove Manus Analytics (Umami) script from client/index.html
- [x] Remove vitePluginManusRuntime from vite.config.ts
- [x] Update ENV registry to document new env vars and deprecate Forge vars
- [x] Write self-hosted-modules.test.ts (18 tests: LLM x5, Storage x4, Notifications x4, Stubs x3, ENV x2)

## Auth Follow-up Round 2 (2026-03-28)
- [x] Harden admin seed: add mustChangePassword flag, log credentials once, force change on next login
- [x] Add /users Administration group to DashboardLayout sidebar (admin-only, hidden from non-admins)
- [x] Wire Resend email delivery into requestMagicLink procedure (replace console.log fallback)

## Auth & Admin Round 3 (2026-03-28)
- [x] Set ADMIN_SEED_PASSWORD deployment secret
- [x] Add "Change Password" link to sidebar footer dropdown
- [x] Create admin_audit_log table (schema + migration + DB helper)
- [x] Wire audit logging into updateUser, deleteUser, register, changePassword procedures
- [x] Add audit log viewer UI for admins (in UserManagement page or dedicated /audit page)

## Bug Fixes (2026-03-28)
- [x] Fix "Invalid email or password" login error for seeded admin account — inserted admin@rilan.com with bcrypt hash of Admin@2024! directly (seed was skipped because shussnain.raza@gmail.com admin already existed)

## Auth Polish Round 4 (2026-03-28)
- [x] Fix login form email placeholder (admin@rilan.local → admin@rilan.com)
- [x] Add auth.setPassword procedure + account settings UI for Google OAuth users with no passwordHash
- [x] Wire user.login audit log entries into loginWithPassword and verifyMagicLink

## Google OAuth Integration (2026-04-14)
- [x] Install passport, passport-google-oauth20, and @types/passport-google-oauth20
- [x] Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env secrets
- [x] Implement /api/auth/google and /api/auth/google/callback Express routes
- [x] DB upsert: create or link Google account to existing user by email
- [x] Issue JWT session cookie on successful Google callback
- [x] Write audit log entry for google login
- [x] Add "Continue with Google" button to Login.tsx
- [x] Add Google icon SVG component (inline in Login.tsx)

## UX Polish (2026-04-14)
- [x] Show Google-linked badge next to user names in User Management table
