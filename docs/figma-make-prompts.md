# Baby Kingdom Admin - Figma Make Prompts

Tech Stack: Vue 3 + Element Plus, Traditional Chinese (zh-HK) admin dashboard (English i18n in v1.1).
Design Style: Clean, modern admin panel. Left sidebar navigation, top header bar with user info / language switch / notification bell.

---

## 0. Global Layout

```
Design an admin dashboard layout with:
- Left sidebar (dark theme, 240px width, collapsible): logo "BK Admin" at top, navigation menu grouped by sections:
  - Overview: Dashboard
  - Content: Feed Queue, Scanner, Trends, Poster
  - Configuration: Personas, Tone Modes, Topic Rules, Forum Boards
  - System: Config, Google Trends Data, Queue Monitor, Audit Log, Users
  - Each menu item has an icon and label
  - Active item highlighted with accent color
  - Collapse button at bottom
- Top header bar: breadcrumb on left, right side has notification bell (with red badge count), language toggle (繁中/EN), user avatar dropdown (profile, logout)
- Main content area: white background, 24px padding, scrollable
- Color scheme: primary blue (#409EFF Element Plus default), sidebar dark (#304156), content background (#f5f7fa)
```

---

## 1. Login Page

```
Design a centered login page for "Baby Kingdom Admin":
- Clean white card (400px wide) centered on a subtle gradient background (light blue to white)
- Logo and title "Baby Kingdom Admin" at top of card
- Form fields: Email (with mail icon), Password (with lock icon, show/hide toggle)
- "Remember me" checkbox and "Forgot password" link
- Blue primary login button, full width
- Language toggle (繁中/EN) at bottom right corner of page
- Element Plus form style
```

---

## 2. Dashboard

```
Design an admin dashboard overview page with 6 sections:

Section A - Real-time Status (top row, 5 cards):
- Scanner queue: status badge (Running/Paused), green/yellow indicator
- TrendPuller queue: status badge
- Poster queue: status badge
- Daily Reset: status badge
- Pending Feeds: large number (e.g. "23") with orange warning color, "Awaiting Review" label

Section B - Today's Statistics (second row, 6 metric cards):
- Scanned Posts: number with small chart icon (e.g. "500")
- Hit Rate: percentage with progress ring (e.g. "7%")
- Drafts Generated: number (e.g. "35")
- Posted Today: number split as "5 threads / 13 replies"
- New Trends: number (e.g. "15")
- Persona Usage: mini horizontal bar chart showing each persona's used/remaining quota

Section C - Recent Activity (left 60% of third row):
- Timeline list showing recent events:
  - "Feed FQ-xxx approved by admin@..." with timestamp
  - "Scanner completed: 500 scanned, 35 hits" with timestamp
  - "Post failed: BK009 rate limited" with red tag
  - Each entry has colored dot (green=success, red=fail, blue=info)

Section D - 7-Day Trends (right 40% of third row):
- Line chart: posts/replies count over 7 days (dual line)
- Bar chart below: board activity distribution (horizontal bars showing top 5 boards)

Section E - Quality & Cost (fourth row, left 60%):
- Approval Rate: donut chart showing approved vs rejected percentage, with trend arrow (up/down vs yesterday)
- Avg Review Time: metric card showing "4m 32s" with trend
- Gemini API Cost: line chart showing daily token consumption over 7 days, with today's estimated cost "$0.85"
- Persona Performance: small horizontal bar chart ranking top 5 personas by post count, with rejection rate as secondary red bar overlay

Section F - System Health (fourth row, right 40%):
- Vertical list of external dependency status indicators (data from GET /api/health/services):
  - BK Forum API: green dot "Connected" or red dot "Disconnected" or grey dot "Not Configured"
  - MediaLens: green dot "JWT Valid (expires in 5d)" or yellow dot "Expiring Soon (< 24h)" or red dot "JWT Expired - Action Required" or grey dot "Not Configured"
  - Gemini API: green dot "Operational" or yellow dot "No Recent Activity" or grey dot "Not Configured"
  - Google Trends API: green dot "Connected" or red dot "Disconnected" or grey dot "Not Configured"
- BK Account Health summary: "28/30 active, 2 cooldown" with link to Persona page
- Each row is a compact status line with colored dot + label + detail text + last checked timestamp
- Small mail icon next to red/yellow status indicates email alert has been sent to admins
- Auto-refreshes every 5 minutes (matches backend health monitor cron interval)

Use Element Plus card components, subtle shadows, consistent spacing.
```

---

## 3. Feed Queue

```
Design a feed management page with:

Top bar:
- Tab buttons: Pending (with count badge), Approved (count), Posted, Rejected
- Quick filter chips: "My Claimed", "Today's Posts", "Duplicates" (toggleable, highlighted when active)
- Filter row: dropdown for Board (版块), dropdown for Persona, dropdown for Source (Scanner/Trends/Custom), date range picker
- Right side: "Custom Generate" blue button, "Batch Approve", "Batch Reject", and "Post All Approved" buttons (disabled until applicable)

New updates banner (at top of list, only when new feeds arrive via Socket.io):
- Light blue banner: "5 new feeds available — Click to refresh" with refresh icon. Clicking reloads the list.

Feed list (card-based, not table):
Each feed card shows:
- Left border color indicating sensitivity: green (Tier 1), orange (Tier 2), red (Tier 3)
- Header: Feed ID (monospace), timestamp, status tag (colored), source tag (Scanner/Trends/Custom)
- If Google Trends matched: small "Trending" badge with fire icon
- If quality warning: small yellow "Duplicate?" or "Short" warning tag next to status
- Body:
  - Left column (60%): Thread subject (bold), thread content preview (2 lines), then "Draft:" with AI generated content in a light grey box
  - Right column (40%): Persona card (avatar placeholder, username, archetype tag), Tone Mode tag, Board name tag
- Footer:
  - "Claim" button (or "Claimed by admin@xxx · 8m left" real-time indicator with lock icon and countdown timer, updates via Socket.io)
  - "Approve" green button, "Reject" red button, "Edit" outline button, "Regenerate" outline button
  - Character count: "169 chars"
- Claimed by current user: subtle yellow border/background with "Release" button
- Claimed by other user: greyed out action buttons, lock icon with claimer name
- Viewer role: no action buttons shown, only view content

Batch post progress (when "Post All Approved" is clicked):
- Modal with progress bar: "Posting 8/12... Next in 28s" showing real-time Socket.io updates
- Each posted feed shows green checkmark, failed shows red X with error message
- "Cancel remaining" button

Pagination at bottom.
```

---

## 4. Feed Edit Modal

```
Design a modal dialog for editing a feed before approval:

- Title: "Edit Feed - FQ-20260406-1228"
- Thread info section (read-only, grey background):
  - Thread subject, Board name, Thread TID link
  - Original thread content (scrollable, max 3 lines)
- Editable section:
  - Persona dropdown (with avatar, username, archetype shown)
  - Tone Mode dropdown (with display name)
  - Content textarea (large, 6 rows, with character counter at bottom right)
  - "Regenerate with new settings" link button below textarea
- Admin Notes textarea (2 rows)
- Footer: "Cancel" and "Save & Approve" green button, "Save Draft" outline button
- Element Plus dialog style, 680px wide
```

---

## 5. Scanner Management

```
Design a scanner management page:

Top section:
- "Trigger Manual Scan" button (with play icon), disabled state when scanner is running
- Status card: current scanner status (Running/Idle/Paused), last scan time, next scheduled scan

Scan History table (Element Plus table):
- Columns: Scan Time, Duration, Boards Scanned, Threads Checked, Hits (passed all 7 filters), Feeds Generated, Status (completed/timeout/error)
- Expandable rows showing per-board breakdown
- Pagination

Filter bar: date range picker, status dropdown
```

---

## 6. Trends Management

```
Design a trends management page:

Top section:
- "Trigger Manual Pull" button
- MediaLens token status card: "Token Valid until 2026-03-14" or "Token Expired - Reauthenticate" with warning icon and "Request OTP" button
- Data source toggles: MediaLens (on/off), LIHKG (on/off), Facebook (on/off)

Trends table:
- Columns: Pull ID, Timestamp, Source (tag: medialens/lihkg/facebook), Rank, Topic Label, Sentiment (score + colored label), Sensitivity Tier (colored tag), Tone Mode, Used? (yes/no tag), Feed IDs (clickable links)
- Row colors: subtle tint based on sentiment (green=positive, grey=neutral, pink=negative)
- Pagination and filters (source, date range, used status)
```

---

## 7. Persona Management

```
Design a persona management page:

Top bar: "Add Persona" button, search input, filter by Archetype dropdown, filter by Active status

Card grid layout (3 columns):
Each persona card:
- Header: Account ID (BK009) monospace, active/inactive badge
- Avatar placeholder with username below
- Archetype tag (colored: pregnant=pink, first-time-mom=blue, multi-kid=green, school-age=purple)
- Primary Tone Mode tag
- Stats row: "Posts Today: 3/5" with mini progress bar
- Quick info: Voice cues preview (1 line, truncated), Catchphrases preview (1 line)
- Footer: "Edit" button, "View Details" button
- Token status indicator: green dot (active), red dot (expired)

Edit modal (drawer from right, 480px):
- All persona fields as form inputs
- Voice Cues: multiline textarea
- Catchphrases: multiline textarea
- Tier 3 Script: multiline textarea
- Topic Blacklist: tag input (comma separated)
- Max Posts Per Day: number input
- Override Notes: textarea
- BK Password: password input with show/hide
```

---

## 8. Tone Modes Management

```
Design a tone modes management page:

Top bar: "Add Tone Mode" button, search input

Table layout:
- Columns: Tone ID (monospace), Display Name, When to Use (truncated), Emotional Register, Tier 3 OK (yes/no icon), Priority, Active (switch toggle)
- Expandable row shows: Opening Style, Sentence Structure, What to Avoid, Example Opening
- Row actions: Edit, Delete

Edit modal:
- Tone Mode ID (read-only for existing, editable for new)
- Display Name input
- When to Use: textarea (2 rows)
- Emotional Register: textarea (2 rows)
- Opening Style Instruction: textarea (3 rows) with note "Injected into Gemini prompt"
- Sentence Structure Hints: textarea (3 rows) with note "Injected into Gemini prompt"
- What to Avoid: textarea (3 rows) with note "Injected as negative constraint"
- Example Opening: textarea (2 rows)
- Suitable for Tier 3: switch
- Override Priority: number input
- Active: switch
```

---

## 9. Topic-Persona Rules

```
Design a topic-persona rules management page:

Top bar: "Add Rule" button, search by keyword input, filter by Sensitivity Tier

Table:
- Columns: Rule ID (monospace), Topic Keywords (tag chips, max 3 shown + "+N more"), Sensitivity Tier (colored tag), Sentiment Trigger, Priority Accounts (avatar chips), Tone Mode, Post Type, Actions
- Expandable row: Avoid If condition, Gemini Prompt Hint (full text)
- Row actions: Edit, Delete

Edit modal:
- Rule ID (auto-generated for new, read-only for existing)
- Topic Keywords: tag input (add/remove chips)
- Sensitivity Tier: radio group (Tier 1 green / Tier 2 orange / Tier 3 red)
- Sentiment Trigger: radio group (Any / Positive / Negative)
- Priority Account IDs: multi-select dropdown with persona names
- Assign Tone Mode: dropdown (with "Auto" option)
- Post Type Preference: radio (New Post / Reply / Any)
- Avoid If: textarea
- Gemini Prompt Hint: textarea (3 rows) with note "Injected verbatim into prompt"
```

---

## 10. Forum Boards Configuration

```
Design a forum boards configuration page:

Left panel (30%, tree structure):
- Accordion/tree view of categories and boards:
  - 吹水玩樂
    - 自由講場 (green dot = scraping on)
    - 影視娛樂 (grey dot = scraping off)
    - ...
  - 時事理財
    - ...
- Each board shows: name, green/grey dot for scraping status
- "Sync from BK Forum" button at top of tree
- "Add Category" and "Add Board" buttons

Right panel (70%, selected board details):
- Board name and FID display
- Toggle switches: Enable Scraping, Enable Auto Reply (with tooltip: "审批通过后自动入 Poster 队列发帖")
- Reply Threshold: range slider (min-max, default 0-40)
- Scan Interval: number input (minutes)
- Default Tone Mode: dropdown
- Sensitivity Tier: dropdown
- Notes: textarea

Persona Bindings section (below board config):
- "Add Persona" button
- Table of bound personas:
  - Columns: Persona (avatar + name), Board-specific Tone Mode (dropdown), Weight (high/medium/low dropdown), Daily Limit (number input), Actions (remove)
- Drag to reorder
```

---

## 11. System Config

```
Design a system configuration page:

Tab navigation: MediaLens | BK Forum | Gemini AI | Google Trends | Scanner | Email | General

Each tab shows a form with key-value pairs:
- Each row: Key label (bold, monospace), Value input, Description (grey text below)
- Secret values (API keys, tokens): masked input with "show/hide" eye icon, only last 4 chars visible
- Long text values (GEMINI_SYSTEM_PROMPT, GEMINI_TASK_TEMPLATE): multiline textarea with expand button
- Boolean values (ENABLE_LIHKG, ENABLE_FB_VIRAL): switch toggle
- Number values: number input with step controls

Bottom: "Save Changes" primary button, "Reset to Defaults" outline button
- Unsaved changes indicator: yellow dot on tab label

MediaLens tab has additional section:
- Token Status card: valid/expired indicator, expiry date
- "Request OTP" button → inline OTP input field → "Verify" button

Email tab:
- SMTP Host: text input
- SMTP Port: number input (default 587)
- SMTP User: text input
- SMTP Password: masked input with show/hide
- Sender Address: text input (default "BK Admin <noreply@baby-kingdom.com>")
- "Send Test Email" button → sends a test email to current admin's email to verify configuration
- Note: Admin notification emails (ADMIN_EMAILS) configured in General tab
```

---

## 11.5 Google Trends Data

```
Design a Google Trends data management page (admin only, placed below Config in System menu):

Top section — status bar:
- Last pull timestamp: "Last updated: 2026-04-07 14:30 (30 min ago)" with auto-refresh countdown
- "Trigger Pull Now" blue button (with refresh icon), disabled state while pulling
- Pull frequency indicator: "Auto-pull every 30 minutes via worker cron"
- API connection status: green dot "Connected" / red dot "Error" / grey dot "Not Configured"

Main content — Trends table (Element Plus table):
- Columns:
  - Rank (#, auto-numbered)
  - Query (bold, the trending search term)
  - Score (number, bar-width proportional visualization within the cell)
  - Peak Volume (formatted number, e.g. "12.5K")
  - Duration (hours, e.g. "48h")
  - Categories (tag chips, max 3 shown + "+N more" tooltip)
  - Related Searches (tag chips from trend_breakdown, truncated)
  - News (count badge, e.g. "5 articles", clickable to expand)
  - Parenting Relevance (colored tag: high=green, medium=blue, low=grey, none=red, from Gemini analysis)
  - Safe to Mention (green check / red cross icon)
  - Suggested Angle (text, from Gemini analysis, truncated with tooltip)
  - Actions

- Expandable row (click to expand):
  - Full news list: headline text + source URL link, ordered by relevance
  - Full categories and related searches
  - Gemini analysis summary text
  - "Copy for Prompt" button — copies formatted trend context to clipboard

- Row colors: subtle background tint based on parenting relevance
  - high: light green tint
  - medium: light blue tint
  - none: light grey

- Table toolbar:
  - Filter by Parenting Relevance dropdown (All / High / Medium / Low)
  - Filter by Safe to Mention (All / Safe only / Unsafe only)
  - Search input (filters by query keyword)
  - Date range picker (filter by pull date)

- Pagination at bottom

Gemini Analysis section (below table, collapsible card):
- "Top Pick" highlighted card: shows the single most recommended trend for parenting forums
  - Query name (large), reasoning text, suggested angle
- "Overall Analysis" text block: Gemini's reasoning summary
- "Re-analyze" button: triggers fresh Gemini analysis on current trends data

Stats row (bottom of page, 4 mini cards):
- Total trends pulled: number
- Parenting-relevant: number (high + medium)
- Safe to mention: number
- Last Gemini analysis: timestamp

Use Element Plus card components, subtle shadows, consistent spacing.
Queue Monitor cards (in Queue Monitor page) should include a "Google Trends" queue card showing the 30-min cron status.
```

---

## 12. Queue Monitor

```
Design a queue monitoring dashboard:

Top row - Queue status cards (5 cards, one per queue):
Each card:
- Queue name (Scanner / Trends / Poster / Daily Reset / Stats Aggregator)
- Status badge: Running (green pulse), Paused (yellow), Idle (grey)
- Stats: Waiting / Active / Completed / Failed counts
- Mini sparkline showing activity over last hour
- Action buttons: Pause/Resume toggle, Trigger Now
- Next scheduled run timestamp

Bottom section - Job History:
- Tab per queue, or unified view with queue filter
- Table columns: Job ID, Queue, Started At, Duration, Status (colored tag), Triggered By (cron/manual + user), Actions
- Failed jobs: expandable error details, "Retry" button
- Status filter: All / Completed / Failed / Active

Real-time updates indicator: green dot "Live" badge in corner
```

---

## 13. Audit Log

```
Design an audit log page:

Filter bar:
- Module dropdown (Feed / Persona / Tone / Forum / Queue / Config / Auth / Scanner / Trends / Poster / Gemini)
- Event Type dropdown (grouped by module)
- Operator dropdown (user list + "System")
- Date range picker
- Search input for target ID / Feed ID

Log table:
- Columns: Timestamp, Event Type (colored tag by category), Module (tag), Operator (avatar + name or "System"), Target ID, Action Detail (truncated), Session (admin/worker/api tag)
- Expandable row: full action detail, before/after diff view (side by side, highlighted changes), API status, IP address
- For config changes: show key, old value → new value with color diff

Pagination, export CSV button
```

---

## 14. User Management

```
Design a user management page (Admin only):

Top bar: "Add User" button

User table:
- Columns: Avatar, Username, Email, Role (colored tag: Admin=red, Editor=blue, Viewer=grey), Last Login, Created At, Actions
- Actions: Edit Role (dropdown inline), Delete (with confirmation)

Add/Edit User modal:
- Username input
- Email input
- Password input (only for new user)
- Role: radio group (Admin / Editor / Viewer) with permission description below each option:
  - Admin: Full access to all features
  - Editor: Manage feeds, view configs
  - Viewer: Read-only access

Current user row highlighted, cannot delete self
```

---

## 15. Notification System (overlay)

```
Design a notification dropdown and toast system:

Notification bell dropdown (top right):
- Bell icon with red count badge
- Dropdown panel (320px wide, max 400px tall, scrollable):
  - "Notifications" header with "Mark all read" link
  - List items:
    - Blue dot for unread
    - Icon per type: feed (document), queue (refresh), scanner (search), trends (chart)
    - Title: "12 new feeds pending review"
    - Timestamp: "2 min ago"
    - Click to navigate to relevant page

Toast notifications (top right corner, stacked):
- Element Plus Notification style
- Types: success (green), warning (orange), error (red), info (blue)
- Auto dismiss after 5 seconds
- Examples:
  - Success: "Feed FQ-xxx posted successfully"
  - Warning: "Scanner queue paused - queue full"
  - Error: "Gemini API call failed - rate limited"
  - Info: "TrendPuller completed: 15 new trends"
```
