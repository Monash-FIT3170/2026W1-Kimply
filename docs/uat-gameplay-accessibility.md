# Gameplay usability and accessibility UAT

Use this script with at least three testers: one first-time player, one regular
player, and one keyboard-only or assistive-technology user. Test with two or
more players in the same room where possible.

## Tasks

1. Create a room, share its PIN, and join it from a second browser.
2. Watch a sequence, then complete one round using only the keyboard. Tab to a
   colour tile and activate it with `Enter` or `Space`, then repeat using the
   `R`, `Y`, `G`, and `B` shortcuts; use **Clear** and **Submit** the same way.
3. Explain, without being prompted, whether it is your turn, how many colours
   are selected, how many lives remain, and how long you have left.
4. Toggle **Sound** off, begin the next turn, and confirm no game tones play.
5. Toggle **Motion** to reduced, then trigger an incorrect and a correct
   attempt. Confirm the game state remains clear without shake, glow, or toast
   animation.
6. Let the timer expire once, then confirm the life-loss message and remaining
   lives are understandable.
7. If available, repeat a round with a screen reader and verify the sequence
   state, turn prompt, selection progress, game messages, and low-time alerts
   are announced.
8. Open **How to play**, confirm the instructions are understandable, then
   close it and verify the game can continue. Briefly disconnect the browser
   network and verify the connection indicator changes to **Reconnecting**.

## Record for each tester

| Tester | Completed tasks | Confusing moment / issue | Severity | Suggested change |
| --- | --- | --- | --- | --- |
|  |  |  | Low / Medium / High |  |

Prioritise High issues that stop a player joining, playing, or understanding a
turn. Record the resulting fixes in the milestone submission with a screenshot
or short test video where appropriate.
