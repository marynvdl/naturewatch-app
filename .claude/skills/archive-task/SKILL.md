---
name: archive-task
description: File a merged task. Moves the task file to docs/archive/tasks and ticks it in its parcel.
argument-hint: <docs/tasks/task-file.md>
disable-model-invocation: true
---

# Archive a merged task

Task file: $ARGUMENTS

1. Confirm the task's pull request has merged into `develop` (`gh pr list --state merged --search <task name>`). If it has not, stop.
2. Branch from an up-to-date `develop`: `chore/archive-<task-file-name-without-.md>`.
3. `git mv` the task file into `docs/archive/tasks/`. Fix any relative links inside it that the move breaks.
4. In the parcel, tick the task (`- [x]`) and point its link at the archived copy.
5. If every task in the parcel is now ticked, ask whether to move the parcel to `docs/archive/parcels/` too.
6. Commit, push, and open a pull request into `develop`. Report the URL. Do not merge.
