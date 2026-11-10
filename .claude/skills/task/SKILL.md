---
name: task
description: Start one parcel task from docs/tasks, writing its task file first if it does not exist yet. Use when the user says /task <file>, "do task NN", or "start the next task".
argument-hint: <docs/tasks/task-file.md>
disable-model-invocation: true
---

# Start a task

Task file: $ARGUMENTS

1. Read the task file and the parcel it names in `docs/parcels/`. If no file was given, find the first unticked task in the active parcels and ask which one is meant. If the parcel lists the task but no task file exists yet, name it `task-NN-<short-name>.md` from the parcel's goal line.
2. Check every task above it in the parcel is ticked, and any "Start only after" condition in the task file or the parcel is met. If not, stop and say what is missing.
3. Check the working tree is clean. Then `git switch develop`, `git pull --ff-only`, and `git switch -c feat/<task-file-name-without-.md>`. This branch holds the task file, for tasks in either repo.
4. If the task file does not exist, write it now, on this branch. Do not open a separate docs branch or pull request for it.
   - Read the parcel, `docs/database/` or `docs/blueprint.md` where relevant, and the files the parcel names. Follow the sections of the latest file in `docs/tasks/` or `docs/archive/tasks/`: Goal, Facts already stored, Do this, Do not, Done when, How to work.
   - Ask about any direction you are not at least 90% sure of before writing it.
   - Link the file from the parcel's task line.
   - Stop and wait for approval of the file. The approved task file is the plan. Then commit the task file and the parcel link as the branch's first commit.
5. Check which repo the task is marked for.
   - naturewatch-app: continue with step 6.
   - naturewatch-analysis: read `../naturewatch-analysis/CLAUDE.md` and `../naturewatch-analysis/.claude/skills/task/SKILL.md`. Follow steps 3–10 of that skill in `../naturewatch-analysis`. Skip its plan step if the task file was approved in step 4. Its branches start from `main`, and its pull requests go into `main`. If the task file was written in step 4, push this branch too and open a pull request into `develop` holding only the task file and the parcel link. Link each pull request from the other.
   - Both repos: do the naturewatch-analysis part as above, and the naturewatch-app part here with steps 6–10.
6. Read the files the task names, and `docs/blueprint.md` where it is relevant. If the task file was approved in step 4, that is the plan. Otherwise write a plan that follows the task's "Do this", "Do not", and "Done when" sections, and wait for approval.
7. Make the change. Update `docs/blueprint.md` and `docs/user/` only where the task says, keeping each fact in one place.
8. Run the relevant tests: the catalog suite (`cd frontend/naturewatch && npx vitest run src/catalog`) for catalog or frontend changes, `npm run type-check` and `npm run lint` for frontend code, and pytest for `app/` or `supabase/`. If the task asks for a browser check, run the dev server on `http://localhost` and check a wide screen and a narrow screen. Report what was seen.
9. Commit only the task's files, with no AI attribution. Push the branch and open a pull request into `develop`. Report the pull request URL and the required checks. Do not wait for them, and do not merge.
10. Stop. Do not start the next task.
