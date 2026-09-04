# Quality Assurance Plan

## Definition of Quality Assurance

Quality assurance is the systematic prevention of defects, rather than their detection after the fact.
It covers the practices that keep a product meeting its requirements while it is still being built, so that issues are identified and removed early rather than accumulating into the final release.

For Kimply, quality assurance is not a phase applied at the end of development.
It is a continuous practice embedded in every sprint.
Developers write tests alongside the code they produce, an automated pipeline validates every pull request, and every merge boundary acts as a review gate.
The goal is that the shared integration branch is in a working and testable state at any point during development, and that a regression is caught at the pull request rather than discovered during a demonstration.

Three practices make this enforceable rather than aspirational.

First, the state of the system is written down where the next developer will look for it.
The repository carries a shared guidance document that lists every collection, publication, method, and route, a defect register that records every known defect, and a decision log that records why the system is the way it is.
A change that alters behaviour updates the matching document in the same commit.
A change that does not do so is treated as incomplete and is rejected at review on that basis.

Second, defects are recorded rather than silently carried.
A defect the team decides not to fix immediately receives an identifier in the defect register, together with a description of how it actually fails and what the fix would be.
Deferral therefore becomes an explicit, reviewable decision instead of an accident.

Third, automation owns the checks a human would forget.
Tests, coverage, and code formatting are run by the pipeline on every pull request rather than from memory.

The Release Train Engineers in each subteam are responsible for ensuring their subteam follows this plan in full.
All members of each team are collectively responsible for integrating these standards into the code they produce.

## Software Testing Plan

### Approach

Testing operates at four levels.

Unit tests cover pure functions and helpers in isolation, with no database involvement.
Examples include the room code entry helpers and the keyboard handling logic.

Integration tests exercise each server method through the real remote procedure call against a real database instance.
A single method test therefore proves the method's logic, its database writes, and its error responses together, rather than proving them separately against mocks that may not reflect reality.

Publication tests assert the properties that control what data each client is allowed to receive.
Three of these properties are load bearing: only the current round is published, a player's submitted answer is never published to other clients, and every publication is scoped to a single game room.
The second of these matters most, because publishing a submitted answer would hand the correct sequence to every player who had not yet played that round.
These properties are verified by automated tests rather than assumed.

Whole-game testing exercises the complete loop, from entering a room code through gameplay and elimination to the end-of-game ranking screen.
This is performed manually against a running deployment before each milestone, and under simulated load using purpose-built scripts that connect one hundred concurrent simulated players to a single room and play several rounds.

### Developer obligations

Each developer writes unit tests for the code they add, and updates existing tests when they change existing behaviour.

New test files are placed alongside the existing ones and are discovered automatically by the test runner, so no manual registration step can be forgotten.

Each test is named after the behaviour it verifies, so that a failure reported by the pipeline is understandable without opening the file.

Team members take responsibility for the tests they write.
A test that is incorrect, unreliable, or asserting the wrong thing is that author's responsibility to correct, whether or not the current change caused the failure.

Because all tests share a single database instance, each test clears the data it touches before it runs, so that tests cannot pass or fail depending on the order in which they execute.

### Continuous integration

Automated tests run on every pull request targeting the integration and production branches.
The pipeline provisions a clean database, installs the framework and dependencies from a cache, runs the full suite against the complete application, and produces a code coverage report that is retained as a build artifact.

No branch may be merged while the automated tests are failing.

Coverage is currently enforced at a deliberately low threshold.
This is an honest description of its purpose: it is a smoke gate that proves the suite ran and that the application was instrumented correctly, not a quality gate that certifies the depth of coverage.
Raising the threshold is a planned step, and it should be raised in step with closing the coverage gaps described below rather than raised on its own, since an arbitrary increase would only encourage tests written to satisfy a number.

Code formatting is enforced by a single automated formatter with a shared configuration, so that formatting is never a subject of code review.

### Known coverage gaps

Naming the gaps is part of the plan.
A gap that is documented can be scheduled; a gap that is implied by silence cannot be.

There are currently no automated tests for authorisation, because the server does not yet verify that the connection sending an identifier is the connection that owns it.
This is recorded in the defect register as an outstanding high severity defect, and tests will be written alongside the fix.

There are no tests for concurrency or race conditions.
The register records several read-then-write sequences that could produce inconsistent results if two clients act at exactly the same moment, and reproducing these requires a test harness capable of issuing genuinely simultaneous calls.

Several room management methods, including starting a game, disconnecting, renaming a room, and reconnecting, do not yet have automated tests.

There is no automated browser-driven end-to-end test.
The full user journey is currently verified manually before each milestone.

## Git Management Plan

### Branch model

The production branch holds runnable code and represents the most recent released version of the software.
It should contain no defect that affects the game's core behaviour.

The integration branch is the default target for all development work and is continuously deployed to a separate development environment, so that a change can be exercised in a production-shaped setting before it reaches production.

Each unit of work is developed on its own branch, created from the current integration branch and named after the issue it implements, using a prefix that identifies the kind of work: feature, fix, bug, or chore.

Nobody pushes directly to the production or integration branches.
All work reaches them through a pull request.

The project initially used one long-lived branch per agile subteam.
This was replaced by one branch per issue.
Subteam branches accumulated a week of unrelated work behind a single review, which made merge conflicts larger and reviews correspondingly shallower, since a reviewer facing several hundred lines of unrelated change tends to approve rather than examine.
Issue-scoped branches keep each review small enough to be genuine.

### Workflow

Every branch is created together with a tracked issue, and is linked to that issue in the project management interface, so that the issue shows the work in progress against it.

Every pull request body contains a closing reference to its issue, which causes the issue to close automatically when the pull request is merged and produces a permanent, navigable link between the requirement, the change, and the review.

A pull request into the integration branch requires one approving review.
A pull request into the production branch constitutes a production release and requires two.

### Rules

Commits are kept to approximately five hundred lines so that any single change can be reviewed properly and reverted cleanly if necessary.

Feature branches are deleted once they have been tested, reviewed, and merged.

Force pushing to any shared branch is prohibited.

Commit messages follow a fixed convention that identifies the user story, the type of change, and the area affected, for example:

    [user story 67] feat(leaderboard): implement initial leaderboard
    [user story 21] fix(leaderboard): remove duplicate player entries

### Code review

Reviews follow a documented checklist rather than reviewer preference.
A reviewer reads the repository's guidance document, the defect register, and, where the change affects the interface, the design system, before commenting.

A review checks that the change does not silently undo a documented invariant, that any known defect is raised only if the change makes it worse, that environment-specific configuration has not been duplicated, and that the corresponding documentation was updated in the same change.

Review findings are graded as must fix, should fix, or optional, and each finding points to a specific file and line.

## Non-Functional Requirements

The team has identified the following non-functional requirements.
Where a requirement has been measured, the measurement is stated.
Where it has not, it is identified as a target, so that an intention is not mistaken for a result.

### Performance

The system should respond to a player's action, such as tapping a coloured tile, within half a second.

This requirement is currently not met under load.
Load testing with one hundred concurrent players measured a median response time of approximately 1.1 seconds against a local deployment and approximately 4.4 seconds against the hosted development environment.
The cause is structural and understood: the method that grades a player's submitted sequence performs between six and nine database round trips per call, and four more when the submission causes the round to advance.
Reducing this number is the single highest value performance improvement available to the project and is scheduled accordingly.

A round transition should reach every player at effectively the same moment, so that no player receives an unfair advantage in reaction time.

This requirement is met.
Across one hundred simultaneously connected clients, the spread between the first and last client to receive a new round was measured at a median of approximately twenty milliseconds.

The application should load quickly when launched, and should not degrade over the course of a long session.
Both remain targets and have not yet been formally measured.

### Reliability

The system should run without crashes during a game session.
Load testing recorded zero method errors across more than five hundred gameplay submissions in each run.

Delays experienced by players should be attributable to network conditions rather than to the application itself.
The web server records both total request time and application response time separately for every request, which allows any observed delay to be attributed to the network, the web server, or the application without guesswork.

Game data should remain consistent during execution.
This requirement is partially met.
The defect register records several read-then-write sequences which, under precisely simultaneous access, could advance a round twice, record two winners, or deduct a life based on a stale read.

The application exposes separate liveness and readiness endpoints, so that the hosting platform can distinguish between a process that is running and one that is genuinely able to serve traffic.

### Compatibility

The game runs on both desktop and mobile devices.

The interface supports screen widths from 320 pixels to 1920 pixels.
The gameplay screen was verified across thirteen viewport sizes spanning that range.

The application supports current versions of Safari, Chrome, Edge, and Firefox, and supports iOS 14 and later and Android 11 and later.

Layout sizing uses viewport units that track the visible area rather than the largest possible area, so that mobile browser toolbars appearing and disappearing do not create unreachable content or dead scrolling space.

### Maintainability

Every module carries sufficient documentation, whether as comments or in the project documentation, to explain what it does, so that teammates and future developers extending the project can understand it without reverse engineering.

The architecture is modular, with each component holding a clear and limited responsibility.

New behaviour arrives together with tests.

Known duplication is recorded rather than tolerated silently.
Two instances currently exist, both documented, so that a developer who encounters one does not assume it is intentional design.

### Portability

Kimply is a browser-based application, so a single codebase serves devices of every architecture without platform-specific code.
Because browsers differ in subtle ways, the game is tested across browsers to confirm that behaviour is retained rather than assumed.

The production container image is built once by the automated pipeline and deployed identically to both the development and production environments, which removes an entire class of "works on my machine" failures.

### Security

The following controls are in place.

All writes to the database pass through server-side methods.
The framework's insecure development packages, which would allow a client to write directly to the database, are not installed, and no client-side write permissions are defined.

Data published to clients is scoped to a single game room, and a player's submitted answer is never sent to other clients.

The account collection is never published to any client, so password hashes and salts remain exclusively server-side.

Passwords are salted and hashed before storage, are never stored in plaintext, and are subject to a minimum length requirement.

Traffic is encrypted in transit using certificates managed automatically by the hosting configuration.

The development and production environments share no cloud credential.
Each environment's deployment identity is scoped to a single branch, so a change merged to the development branch cannot obtain access that reaches production.

The following weaknesses are known, documented in the defect register, and scheduled.

The server does not verify that the connection sending a player identifier is the connection that owns that identifier.
A client can therefore act on another player's behalf.
The correct fix is to bind each identifier to its connection.
The fix is explicitly not to require player accounts.

The account password hashing uses a single unstretched hash pass, compares hashes in a manner that is not constant time, and does not rate limit sign-in attempts.

Server methods do not currently validate the shape of their arguments, although the validation library is available in the project.

Anonymous play is a deliberate product decision, not an oversight.
Accounts exist so that a player may have their history stored against them, and are never a prerequisite for joining a room or playing.
A proposal to require accounts is therefore not a security fix and will not be accepted as one.

### Overall Usability

The design appearance and interaction style are uniform across every screen of the game.

All interactive elements are visibly interactive, and navigation between screens is explicit rather than implied.

The interface communicates the rules of the game without requiring separate explanation.

Error messages and feedback explain the problem in the user's own terms rather than in system terms.

Responsive layouts maintain usability across devices rather than merely fitting on them.

### Accessibility

Because the core interaction of the game is four coloured tiles, colour cannot be the sole differentiator between them.

The following are implemented.

Each tile renders a distinct shape in addition to its colour, so that the four tiles remain distinguishable to a player who cannot reliably distinguish the colours.

Tile targets scale with the viewport and remain large enough to support users with limited motor precision.

Modal dialogs are marked up with the roles and labels that assistive technology requires in order to announce them correctly.

The tile palette consists of four widely separated hues at high contrast against a dark neutral background, selected to remain distinguishable under the common forms of colour vision deficiency.

Typography, spacing, and labelling are consistent throughout, and the language used is simple and consistent so that players of varying reading confidence can follow the game.

The following gaps are known.

The tile buttons do not yet carry an accessible name, so a screen reader announces an unlabelled control.

There is no reduced-motion alternative, and sequence playback is driven by flashing and motion.

Both are small and contained changes, and both are scheduled.
They are stated here rather than omitted, because an accessibility section that lists only successes is not an accessibility assessment.

### Scalability

The system should support at least one hundred concurrent users.
This is met with respect to connections and data distribution: all one hundred simulated connections succeeded with no failures in every load test run.
It is not yet met with respect to response time under that load, as described under Performance.

Database performance should remain efficient as data volume grows.
Eleven indexes are created automatically when the server starts, including compound indexes matching the query used by every data publication.

Storage growth is bounded automatically.
Room and round data expires after twenty four hours, and leaderboard history after seven days, which keeps the deployment within the storage allowance of its database tier without any manual cleanup and without deleting data from beneath a game that is still in progress.

The system should be able to scale further in future.
Because every data publication is scoped to a single game room, the volume of real-time data sent by the server grows in proportion to the size of a room rather than in proportion to the size of the whole deployment.
This is the property that makes horizontal scaling possible later, and it is protected explicitly in code review.

Load testing has so far been conducted at one hundred players over five rounds.
Testing at higher concurrency and over a complete game is scheduled.

All members of each team are responsible for integrating these non-functional requirements into the software product.
The Release Train Engineers ensure that their corresponding team does so.

## Accessibility and Usability Analysis

### How Kimply applies accessibility

The navigation structure is consistent, so that menus, buttons, and page layouts behave the same way on every screen and the user can transfer what they learn from one screen to the next.

Text is readable and is presented at a contrast level that survives visual impairment and colour vision deficiency.

Validation and error messages prevent incorrect input rather than punishing it after submission, which reduces both user frustration and invalid system state.

Simple and consistent language is used throughout, so that players of varying literacy can follow the instructions and the navigation.

Spacing and labelling around buttons, forms, and input fields support users with motor impairments.

The game tiles carry shapes as well as colours, so that colour is never the sole carrier of meaning.

### Measures taken to ensure usability

The interface uses a bright tile palette against a dark neutral background, which keeps the game elements prominent and the surrounding interface quiet, improving both appearance and focus.

Buttons are sized generously and scale with the viewport, so that players on mobile devices can interact accurately.

Clickable cards state clearly and concisely what will happen when they are selected.

Confirmation popups are used for actions that are difficult to reverse.
These popups describe the action being confirmed, which prevents accidental interaction and teaches the user what that action does for future encounters.

Text placeholders describe or exemplify the expected input rather than merely labelling the field.

Immediate feedback is provided throughout the game, so that the outcome of an action is never ambiguous.

Controls such as Clear and Submit remain disabled until they can validly be used, which makes an invalid submission unreachable rather than merely rejected.

The experience is separated into distinct stages, joining, playing, and viewing results, so that no single screen presents the user with everything at once.

The final leaderboard presents the ranking visually, distinguishing the top three players from the rest through colour and animation, so that the outcome is understood at a glance rather than by interpreting raw scores.

## Design System and Style Guide

The interface follows a single documented design system covering colour, typography, spacing, corner radii, elevation, motion, components, interaction patterns, and written voice.
A player moving from the lobby to the game to the results screen encounters the same visual language, the same interaction patterns, and the same navigation structure throughout.

Headings use large, bold type to establish a clear hierarchy.

A minimum readable type size is maintained across devices.

A single consistent colour palette is used throughout the game, with the accent colour reserved for the single most important action on any given screen.

Buttons follow a standard size, spacing, and interaction style, and navigation components remain consistent across pages.

Consistent spacing and alignment are applied throughout, and elements are given sufficient room to avoid overcrowding.

Motion is used to convey state rather than to decorate, with defined durations and easing curves for each category of transition.

### Style guide obligations

Developers in each agile team follow the agreed interface standards when implementing features.

Reusable components are preferred over new single-use markup.

Interface changes are reviewed as part of pull request review, and are assessed against the design document rather than against individual taste.

Kimply's design system is built directly on a utility-first CSS framework rather than adopting an off-the-shelf component library.
This decision keeps the delivered bundle small, retains full control over the game's distinctive tile-based visual language, and avoids coupling the project to a third-party system whose future direction would constrain ours.

## Known Gaps in This Plan

The following are recorded so that the next milestone can close them deliberately rather than rediscover them.

The coverage threshold is a smoke gate, which means a change can reduce meaningful coverage without failing the pipeline.
The threshold will be raised once the untested methods identified above have tests.

The automated formatting check does not yet run in the pipeline, because the existing codebase does not currently satisfy it.
A single dedicated formatting commit is required first, after which the check can gate every pull request.

There is no automated browser-driven end-to-end test, so the complete user journey is verified manually before each milestone.

There are no authorisation or concurrency tests, since the corresponding defects are not yet fixed.
These tests will be written together with the fixes rather than in advance of them.

The game tiles lack an accessible name, and the application provides no reduced-motion alternative.

Load testing has been performed at one hundred concurrent players over five rounds only, which meets the stated requirement at its boundary rather than with headroom.
Testing at higher concurrency and over a full game is scheduled.
