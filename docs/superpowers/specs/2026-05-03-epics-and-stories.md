# Epics & Stories

Ordered by dependency within each release. Build epics top-to-bottom — each one unblocks the next.

---

## Release 1 — "Get It On The Board"

---

### Epic 1: Foundation & Infrastructure

> Developer can run the full stack locally and deploy to production via git.

- As a developer, I can run the full stack (DB + backend + frontend) locally with one command
- As a developer, the DB schema is version-controlled with migrations (no manual SQL)
- As a developer, merging to main automatically deploys to production
- As a developer, opening a PR creates a live preview environment I can click through

---

### Epic 2: Auth & Users

> Users can register, log in, and join leagues via invite. Capabilities are determined by subscription tier.

- As a new user, I can register with my email and password
- As a returning user, I can log in and stay logged in across sessions
- As a logged-in user, I can log out
- As an Admin, I can generate an invite link for my league
- As a Player or Player Pro, I can click an invite link and be added to the league
- Multiple Admin-tier users can be associated with the same league

---

### Epic 3: League Setup

> An admin can create a league, configure its sport and format, and manage its player roster.

- As an admin, I can create a league with a name, sport, and team format (singles or doubles)
- As a user, I can see all leagues I belong to after logging in
- As an admin, I can mark any player in my league as a regular or a sub
- As an admin, I can add a placeholder player (name only, no account) so I can record their games before they sign up
- Placeholder players are fully usable in score entry — no account required

---

### Epic 4: Score Entry

> An admin can record a full evening's games on desktop or mobile.

- As an admin, I can create a session for a specific date
- As an admin, I can add games to a session by selecting players from a dropdown and entering scores
- As an admin, I can add a new player to the league inline while entering scores (no separate flow)
- As an admin, I can submit a complete session once all games are entered
- As an admin, I can delete a session I entered by mistake

---

### Epic 5: Global Player Filter

> Any view in the league can be scoped to a subset of players, with a quick toggle between regulars and subs.

- As a player, I can toggle between "regulars only" and "all players" and have every view update accordingly
- As a player, I can select a custom subset of players to focus on across all views
- The active filter persists as I navigate between standings, game history, and player profiles
- As an admin, the filter defaults to regulars only when a league has regulars defined

---

### Epic 6: Standings

> Players can see where they rank in the league.

- As a player, I can see the league standings ranked by average points per game
- As a player, I can see each player's win rate alongside their average points
- As a player, I can see the number of games each player has played in the standings

---

### Epic 7: Game History

> Players can browse all games played in the league.

- As a player, I can see a list of all games played in the league with scores and players
- As a player, I can filter the game list by date range

---

### Epic 8: Player Profile

> Players can see their personal record and how they perform with/against others.

- As a player, I can view my overall record (wins, losses, average points)
- As a player, I can see my W/L breakdown with each partner I've played alongside
- As a player, I can see my W/L breakdown against each opponent I've faced

---

## Release 2 — "Make It Interesting"

---

### Epic 1: Player Insights *(Player Pro)*

> Players get a personalised performance breakdown beyond raw stats.

- As a Player Pro, I can see my biggest rivals (players who beat me most)
- As a Player Pro, I can see my bogeys (players I consistently struggle against)
- As a Player Pro, I can see my freebies (players I consistently beat easily)
- As a Player Pro, I can see my recent form (trend over last N games)

---

### Epic 2: Compare Players *(Player Pro)*

> Players can run a head-to-head comparison between any two players.

- As a Player Pro, I can select any two players and see a full head-to-head breakdown
- As a Player Pro, the comparison shows direct matchups, avg points, and win rate against each other

---

### Epic 3: Advanced Game Browser *(Player Pro)*

> Players can slice and filter game history in detail.

- As a Player Pro, I can filter games by player, partner, and outcome
- As a Player Pro, I can see my performance stats for any filtered subset of games

---

### Epic 4: Pairs Analysis *(All players)*

> The league can see which partnerships work and which are underused.

- As a player, I can see the best and worst performing partnerships in the league
- As a player, I can see which player pairings have rarely or never played together

---

### Epic 5: Subscription Tiers

> Features are gated by subscription tier. Users upgrade their own account.

- As a Player, Player Pro features are visible but locked with an upgrade prompt
- As a Player Pro, Admin features are visible but locked with an upgrade prompt
- As a user, I can upgrade my subscription tier to unlock additional features

---

### Epic 6: Standings Enhancement

> Standings account for the strength of opponents faced.

- As a player, wins against stronger opponents count for more in the standings
- As a player, I can toggle between simple avg points and strength-weighted standings

---

### Epic 7: Commissioner Tier

> A Commissioner can manage multiple leagues from one account.

- As a Commissioner, I can see an overview of all leagues I manage
- As a Commissioner, I can create multiple leagues
- As a Commissioner, I can invite other Admin-tier users to my leagues

---

### Epic 8: Second Sport

> The platform supports a second racquet sport, proving the sport-agnostic model.

- As an admin, I can create a squash league using the existing league creation flow
- Squash scoring rules (games to 11, singles only) apply correctly throughout the app

---

### Epic 9: Player Merge Tool

> Admins can clean up duplicate player entries.

- As an admin, I can search for and select two player entries to merge into one
- All historical games and stats are preserved and attributed to the merged player
