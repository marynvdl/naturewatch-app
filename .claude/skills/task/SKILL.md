---
name: task
description: Start one parcel task from docs/tasks. Use when Maryn says /task <file>, "do task NN", or "start the next task".
argument-hint: <docs/tasks/task-file.md>
disable-model-invocation: true
---

# Start a task

Task file: $ARGUMENTS

1. Read the task file and the parcel it names in `docs/parcels/`. If no file was given, find the first unticked task in the active parcels and ask which one is meant.
2. Check the task is marked for naturewatch-app. If it is for naturewatch-analysis, stop and say to run it from that checkout.
3. Check every task above it in the parcel is ticked, and any "Start only after" condition in the task file is met. If not, stop and say what is missing.
4. Check the working tree is clean. Then `git switch develop`, `git pull --ff-only`, and `git switch -c feat/<task-file-name-without-.md>`.
5. Read the files the task names, and `docs/blueprint.md` where it is relevant. Write a plan that follows the task's "Do this", "Do not", and "Done when" sections, and wait for approval.
6. Make the change. Update `docs/blueprint.md` and `docs/user/` only where the task says, keeping each fact in one place.
7. Run the relevant tests: the catalog suite (`cd frontend/naturewatch && npx vitest run src/catalog`) for catalog or frontend changes, `npm run type-check` and `npm run lint` for frontend code, and pytest for `app/` or `supabase/`.
8. If the task asks for a browser check, run the dev server on `http://localhost` and check a wide screen and a narrow screen. Report what was seen.
9. Commit only the task's files, with no AI attribution. Push the branch and open a pull request into `develop`. Report the pull request URL and the required checks. Do not wait for them, and do not merge.
10. Stop. Do not start the next task.
