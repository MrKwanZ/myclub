# MyClub

MyClub is a club management assistant for amateur teams. One product serves many clubs. A manager runs the club in the browser: roster, calendar, attendance, match results, and finances. A player replies to training and matches on the phone, and can do the same in the browser. Every club row is stored with a `clubId`. Attendance, wins and losses, and the balance are calculated from those tables.

## Features

One login can belong to more than one club. The same person can manage one club and play for another. A club switcher appears when an account has more than one membership. A super admin always sees every club in that menu.

- **Notification centre.** A bell button at the top right of every manager and player page, left of the page's own action button if it has one. Every toast shown while signed in is saved (`POST /me/notifications`). Opening the bell clears the toasts on screen, swaps the icon to a filled bell, and lists the current club's toasts from the past 3 days (`GET /me/notifications`) with a spinner while loading. A "You replied …" toast opens the My Attendance tab of the player dashboard. Signing in does not show a welcome toast. When the club has an upcoming event, sign-in shows an "Incoming Event" toast: "Incoming [event name] on [event date & time]." A player who has not replied also sees "Please reply your availability". That toast, and the Maybe reminder, opens the calendar on that event's day (`?date=YYYY-MM-DD`). Other toasts are clickable but stay put.

### Super Admin

The API seeds one administrator: name Administrator, email `admin@myclub.app`, password `admin123`, club Administrator. The sidebar shows that role as Super Admin. Signing in opens the Administrator club, and the club menu lists every club so the same manager pages (roster, matches, lineup, finance) open for whichever club is selected. Admin Panel sits between Account and Sign Out and is shown only for this user. `/admin` has User and Club tabs. Both tables sort by club name, show the first 10 rows, and load the next 10 when that list is scrolled. Created dates and last login use `YYYY-MM-DD HH:mm AM/PM`. Each row’s actions menu edits the record in a form or deletes it after confirmation, in the same way as a finance transaction. The seeded administrator account and its club cannot be deleted, and an administrator cannot delete their own login.

### Manager

Managers use the web app.

- **Club.** Create a club from `/register`. The steps are Personal (name, email, password), Club (name, description, goals, logo, and jersey images), then Confirm and Complete. On the Club step, three optional checkboxes accept a roster CSV, a financial table CSV, and an event schedule CSV. Each checked box requires a `.csv` file and shows its full file name. Only the checked imports add a preview step (Roster, Finance, or Events) between Club and Confirm. Each preview is a read-only table of the matching columns; a row that fails validation blocks Next until a corrected file is uploaded. Confirm lists each uploaded file name. Create club is the only action that writes the rows, through one `POST /clubs/:clubId/import` after the club exists. A roster file can include goals, assists, yellow cards, red cards, played minutes, and saves as well as name, position, shirt number, contact, and status. Imported players, transactions, and events then show on Roster, Finance, Matches, and the calendar. A breadcrumb at the top of the registration surface lists the active steps. Steps already completed can be opened again; steps not reached yet stay disabled. Creating the club replaces the Create club button with a spinner and “Creating your club…”. The last step links to that club’s dashboard. Afterwards, edit the club from Account at `/account`. A ghost button in the account navigation shows the signed-in person’s photo or initials, name, and role. The page centers the signed-in person’s photo (or initials) and name, then groups the rest in an accordion inside a centered rounded surface at 80% of the page width. Personal saves the name and a telephone contact, and holds the light/dark switch. Password checks the current password against the account and requires the new password and confirmation to match. Club keeps the name, description, goals, logo, and jersey images (`POST /clubs/:clubId/jerseys`); the logo and jersey uploads share one row, and an attendance alert warns a player on their next sign-in when their attendance is under the saved percentage. Data previews a roster, matches, or finance CSV and imports it only after Confirm; the success toast opens Roster, Matches, or Finance. Account sits with Sign Out in the account navigation and uses the same button style as the other navigation links.
- **Roster.** Add players with position, shirt number, a telephone contact, goals, assists, yellow/red cards, played minutes, saves (for goalkeepers), and status (active, injured, or on leave). An injured player picks an expected return date from a date picker. A player on leave picks the leave range from a date range field. The roster table displays name, position, shirt number, status, and the last five past attendance marks (a success “S” chip for present or late, a danger “A” chip otherwise). Each player's name links to their full information view.
- **Player information view.** View a player's full profile and stats on `/roster/[playerId]`, including calculated attendance rate (Yes/Maybe replies over total events) and goalkeeper save percentage (`saves / (saves + match goals conceded)`). The expected return date, or the leave from and leave until dates, is the last row and only appears for that status. An actions menu can edit, delete, or link/create a login.
- **Calendar.** Schedule training, matches, friendlies, and leisure events with a name, place, start time, and notes. Record an opponent and a score for matches. The result (win, loss, or draw) is written from the score. Matches and friendlies with an attached lineup show a “Show lineup” icon button next to Edit that opens the saved pitch lineup in a modal.
- **Lineup.** Manager-only squad lineup builder at `/lineup`. Select up to 11 players from a virtualized club player list to place them on the soccer pitch by position: Goalkeeper at the lower middle (max 1), Defenders at the lower quarter (max 5), Midfielders across the middle (max 5), and Forwards at the upper quarter (max 3), spaced evenly from left to right. Exceeding the 11-player cap or a position limit highlights the list and shows an inline error message. Players on the pitch can be dragged within the pitch bounds, styled with any uploaded club jersey, cleared in one click, downloaded directly as a PNG image, or saved as a matchday lineup on an incoming match or friendly (`PUT /clubs/:clubId/events/:eventId/lineup`).
- **Attendance.** Each active or injured player gets a row for every event. A manager can mark a player unanswered, present, absent, maybe, or late. Late counts as attended in the recent rate. A Maybe that is still open after the event starts counts as absent.
- **Dashboard.** The heading greets the manager by local time, for example “Good morning, Alex”. The Games tab lists each incoming match with its title first. Past results show the score in green for a win, the default text color for a draw, and red for a loss, without a win, loss, or draw label. The page also shows top scorers, top assists, injury updates, and income, expenses, and balance. New Announcement posts a title and message to the club. The manager sees “Announcement created successfully” straight away. Every other member sees the announcement as a toast the next time they sign in, and opening the notification centre moves that toast into the list.
- **Finance.** Record income and expenses. The balance is income minus expenses. The income and expense chart, including its legend, stays hidden until the club has a transaction.

### Player

Players use the Expo app or the same flows in the browser.

- **Dashboard.** The player home at `/play`. The heading greets the player by local time, for example “Good evening, Sam”. Three tabs: Upcoming Event (reply Yes, Maybe, or No; a future event with no reply starts as RSVP and does not show a Pending Reply chip), Past Matches (a card per finished match, with the score in green for a win, the default text color for a draw, and red for a loss), and My Attendance (the seven most recent sessions first, then the next five on demand). A past session with no reply, or a Maybe that is still open after the start time, is shown as Absent. A Maybe reply shows a reminder to confirm the day before the event.
- **Update Status.** A kebab button at the bottom right of every player page. Injury Update sets the roster status to injured, with the injured area, expected return date, and optional remarks. Request on Leave sets the status to on leave for the chosen date range. The manager sees each report as a toast the next time they sign in.
- **Calendar.** Browse the club’s events by day, and open the saved pitch lineup modal from the “Show lineup” button on any match or friendly that has a lineup attached.

## Repository

npm workspaces. Shared request shapes live in `packages/shared`.

| Path | Role |
| --- | --- |
| `apps/api` | Hono API, Prisma, PostgreSQL |
| `apps/web` | Next.js app for managers and players |
| `apps/mobile` | Expo app for players |
| `packages/shared` | Zod schemas, labels, and date helpers |

| Script | What it does |
| --- | --- |
| `npm run dev:api` | API on http://localhost:4000 |
| `npm run dev:web` | Web app on http://localhost:3000 |
| `npm run dev:mobile` | Expo dev server |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run typecheck` | Typecheck shared, API, web, and mobile |

## Requirements

- Node.js 20 or newer
- PostgreSQL, with a database named `myclub`

## Setup

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm install
npm run db:migrate
```

`apps/api/.env` needs `DATABASE_URL` and `JWT_SECRET`. The example uses a local role named `myclub` with password `myclub_local`:

```bash
psql -d postgres -c "CREATE ROLE myclub LOGIN PASSWORD 'myclub_local'"
psql -d postgres -c "CREATE DATABASE myclub OWNER myclub"
```

Postgres.app blocks passwordless connections from Node. For that app, password auth for the `myclub` role has to come before the local trust rules in `pg_hba.conf`, then reload Postgres.

`apps/web/.env.local` sets `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`) and `NEXT_PUBLIC_SITE_URL`.

## Run

Use three terminals:

```bash
npm run dev:api
npm run dev:web
npm run dev:mobile
```

- API: http://localhost:4000 (`GET /health` returns `{ "ok": true }`)
- Web: http://localhost:3000
- Mobile: Expo. Press `w` for a browser preview, or open the project in Expo Go.

On a phone, the API is not `localhost`. Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to this computer’s LAN address, for example `http://192.168.1.20:4000`. The Android emulator uses `http://10.0.2.2:4000` when that variable is unset.

## First club

Open the web app and create a club. You are the manager. On the roster, add players and create a login for each one. That login is what the player uses on the phone. Leave the password blank to link an email that already has an account, including someone who manages a different club.

## Coming soon

These tables exist in the database. This version has no screens for them.

- **Photos.** A photo belongs to a club, and optionally to one event.
- **Match documents.** A file a manager would give a referee, attached to a match.
- **Tactics board.** A named board stored per club.
- **Coach role.** The membership column can hold `coach` later. This version assigns manager, player, and the seeded super admin.
