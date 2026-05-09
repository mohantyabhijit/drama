# Council Home Simplification Design

Date: 2026-05-09
Project: D.R.A.M.A.
Scope: Replace the current landing-page-style app shell with a prompt-first home screen for Friends Mode.

## Goal

Turn the app into a focused product surface instead of a demo or marketing page. The first screen should do one job well:

1. Let the user type or speak a question into one shared prompt box.
2. Let the user submit that question with one clear `Ask Council` action.
3. Keep the council visually present through a small row of member photos.
4. Let the user tap a specific council member after submission to start talking directly with that member.

## Non-Goals

- Redesigning the downstream live voice runtime.
- Changing how Friends Mode sessions are initialized on the backend.
- Adding new council personas or changing their behavior.
- Building a full onboarding, settings, or discovery flow.
- Preserving any landing-page sections such as hero copy, architecture panels, or demo workspace sections.

## User Experience Summary

The app opens directly into a single screen. At the top is a compact row of five council member photos. Beneath that is one input area where the user can either type or use voice-to-text. A single primary button, `Ask Council`, submits the question.

After submission, the same screen transforms in place rather than navigating away. The council row remains visible and shifts into a lightweight status state such as thinking, then ready. Once ready, the user can tap any council member photo to open a live voice conversation with that specific member.

This keeps the product understandable in one glance:

- ask one question
- wait for the council
- pick one member to talk to

## Primary User Flow

### Before submit

1. User lands on the home screen.
2. User sees:
   - a small row of five council member photos
   - one prompt box
   - one mic control for voice-to-text
   - one `Ask Council` button
3. User either types in the prompt box or taps the mic and speaks.
4. Voice transcription populates the same prompt box rather than a separate field or mode.

### During submit

1. User taps `Ask Council`.
2. The screen stays in place.
3. The council enters a visible `thinking` state.
4. Each member photo can reflect status progressively if available, for example idle, thinking, then ready.

### After submit

1. The screen transitions to a `ready` state without leaving the page.
2. The council member photos remain the main interaction surface.
3. User taps one member photo.
4. The app starts that member's live voice preview session.
5. The active member photo shows an active or live state so the user knows who they are speaking with.

## Core Screen Structure

### Top bar

Very minimal. No sticky marketing navigation. No multi-link header. Keep only what supports the product.

Recommended contents:

- a very small `D.R.A.M.A.` label or mark
- optional compact readiness label only if it adds clarity

### Council photo row

This is the main piece of retained personality on the simplified screen.

Requirements:

- Show all five council members as photos, not abstract badges or generic initials.
- Photos should feel like distinct personalities.
- The row should be visible before submit, not hidden behind later state.
- Photos should be compact and secondary to the input before submit.
- Photos become tappable interaction targets after the council is ready.

States:

- idle: visible but quiet
- thinking: subtle activity treatment
- ready: visually tappable
- active: clearly indicates the currently live member

### Prompt composer

This is the primary interaction block.

Contents:

- one prompt box
- one voice-to-text control
- one `Ask Council` button

Behavior:

- typing and speaking both write into the same text field
- the mic starts or stops browser speech recognition
- transcribed text is appended into the existing prompt box
- the button is disabled when the field is empty
- the button changes state while the council is thinking

### Status messaging

Use the smallest amount of helper text needed to reduce ambiguity.

Examples:

- `Tap the mic to speak.`
- `Council is thinking...`
- `Council ready. Tap a member to talk.`

Avoid explanatory product copy, feature grids, manifesto text, or onboarding paragraphs.

## Interaction Model

### Voice-to-text input

The mic belongs to the prompt composer, not to a separate voice mode screen.

Expected behavior:

- tap mic to start listening
- show temporary listening state
- insert recognized speech into the prompt box
- stop listening automatically on recognition end or manually on second tap
- if browser speech recognition is unavailable, disable the mic and keep typed input fully usable

### Ask Council

On submit:

- validate non-empty prompt
- initialize Friends Mode if needed
- preserve the current screen
- set the council row into thinking state
- update member readiness progressively if supported by the existing timers
- surface a concise ready message once all members are ready

### Talk to a member

The council photos become the entry point into individual live conversations.

Expected behavior:

- tapping a ready member photo starts that member's voice preview
- only ready members are tappable
- the selected member shows an active state
- if another member is tapped, the current live preview closes and the new one opens
- translation agents, if still present in the council definition, should keep their existing runtime behavior while using the same photo-card interaction pattern

## Visual Direction

### Design principles

- Remove all landing-page vibes.
- Keep the screen calm, spare, and product-like.
- Preserve just enough personality through council photos and a confident primary action.
- Favor a warm, quiet, editorial palette over startup-marketing contrast blasts.
- Keep the interface legible and mobile-first.

### Layout tone

The chosen direction is closest to:

- the earlier `B` structure for overall composition
- the earlier `C` restraint for copy density and chrome reduction

That translates to:

- visible council presence near the top
- almost no intro copy
- one strong action path
- no extra sections below the fold on the initial home experience

### Photos

Council members should use photos rather than colored circles or letter avatars.

Recommendations:

- use stylized portrait assets or photo-like character portraits
- keep framing consistent across all five members
- preserve enough visual difference that users can quickly recognize who they want to talk to
- avoid overly detailed cards; the photo itself should carry the identity

## Architecture and Component Changes

### Keep

- the existing Friends Mode runtime logic in [src/App.tsx](/Users/abhijitmohanty/Programming/drama/src/App.tsx)
- the existing Friends Mode panel behavior in [src/FriendsModePanel.tsx](/Users/abhijitmohanty/Programming/drama/src/FriendsModePanel.tsx)
- current voice preview startup logic
- current browser speech recognition flow

### Remove from the initial screen

- sticky marketing header and nav
- hero split layout
- live-room demo section
- transcript, verdict, summary, persona setup, architecture, checklist, and call-to-action sections from the default first view

These can be removed entirely or hidden from the simplified experience, depending on whether we want to preserve them temporarily during refactor. The intended final product surface is a single focused screen.

### Recommended component shape

Suggested near-term structure:

- `App`
  - owns high-level Friends Mode state and event handlers
  - renders a single simplified home shell
- `CouncilHome`
  - layout wrapper for the simplified screen
- `CouncilPhotoRow`
  - renders member photos and their state
- `PromptComposer`
  - renders shared text input, mic, and ask button
- existing `FriendsModePanel` logic can either be:
  - refactored into the new components, recommended
  - or temporarily reduced and restyled in place, acceptable for a first pass

Recommendation: refactor toward smaller focused components while preserving existing runtime logic. This will make the simplified UI easier to understand and change.

## State Model

The simplified screen can be represented with a small number of UI states:

- `idle`
  - no submitted question yet
- `listening`
  - browser speech recognition is active
- `thinking`
  - question submitted, council preparing
- `ready`
  - all council members can be tapped
- `live`
  - one member is currently active for voice conversation

Important derived data:

- current prompt text
- whether the mic is supported
- per-member prep state
- currently active member id
- status message for the screen

## Error Handling

Keep errors compact and actionable.

Cases:

- empty prompt on submit
- speech recognition unsupported
- speech recognition failure
- Friends Mode initialization failure
- live voice preview startup failure
- tapping a member before ready

Guidelines:

- show short inline error text near the composer or council row
- do not open modals for normal recoverable errors
- keep the typed prompt intact on failure

## Responsiveness

The screen should be designed mobile-first and also feel intentional on desktop.

Mobile priorities:

- council photos remain visible without crowding the composer
- prompt box stays comfortably tappable
- `Ask Council` remains obvious and easy to press

Desktop priorities:

- avoid reintroducing a big marketing-style split hero
- keep width constrained so the screen still feels like a focused tool
- allow slightly more breathing room around the photo row and composer

## Accessibility

- all council photos must be keyboard reachable once interactive
- active, ready, and disabled states must be visually and semantically distinct
- mic control needs clear `aria-label` behavior for start and stop recording
- status text should be available to assistive technology
- focus management should remain stable when the council changes state in place

## Testing Strategy

### Functional checks

- typed prompt submits correctly
- voice-to-text appends text into the same input
- empty prompt cannot submit
- `Ask Council` transitions to thinking state
- readiness state progresses correctly
- tapping a ready member starts a live session
- switching members swaps the active live session cleanly

### UI checks

- no old landing-page sections remain in the first screen
- avatar row is visible before submit
- member photos remain distinct on mobile
- composer and primary action remain above the fold on common mobile sizes

### Regression checks

- existing Friends Mode initialization still succeeds
- existing voice preview cleanup still runs on unmount or member switch
- browsers without speech recognition can still complete the full typed flow

## Open Decisions

These do not block implementation planning, but should be resolved during design polish:

- whether the member photos are generated portraits, stock-derived portraits, or illustrated portraits
- whether non-active members stay visible during a live conversation or collapse into a smaller strip
- whether the top brand label remains text-only or includes a minimal mark

## Recommendation

Implement this as a focused refactor, not a layer of new UI added on top of the current page. The existing code already contains the right behavior primitives, especially in Friends Mode. The main work is simplifying the screen, restructuring components, and replacing placeholder avatar treatments with real member photos.

This gives the product a much clearer first impression:

- one question
- one submit action
- one council to choose from

