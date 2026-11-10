---
name: task
description: Start one parcel task from docs/tasks, writing its task file first if it does not exist yet, and archive it on the same branch when it is done. Use when the user says /task <file>, "do task NN", or "start the next task".
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
   - naturewatch-analysis: read `../naturewatch-analysis/CLAUDE.md` and `../naturewatch-analysis/.claude/skills/task/SKILL.md`. Follow steps 3–10 of that skill in `../naturewatch-analysis`. Skip its plan step if the task file was approved in step 4. Its branches start from `main`, and its pull requests go into `main`. If the task file was written in step 4, push this branch too and open a pull request into `develop` holding only the task file and the parcel link. Link each pull request from the other. When the analysis work is done, archive the task on this branch as in step 10, and push it.
   - Both repos: do the naturewatch-analysis part as above, and the naturewatch-app part here with steps 6–11.
6. Read the files the task names, and `docs/blueprint.md` where it is relevant. If the task file was approved in step 4, that is the plan. Otherwise write a plan that follows the task's "Do this", "Do not", and "Done when" sections, and wait for approval.
7. Make the change. Update `docs/blueprint.md` and `docs/user/` only where the task says, keeping each fact in one place.
8. Run the relevant tests: the catalog suite (`cd frontend/naturewatch && npx vitest run src/catalog`) for catalog or frontend changes, `npm run type-check` and `npm run lint` for frontend code, and pytest for `app/` or `supabase/`. If the task asks for a browser check, or changes what the app shows, run the `browser-check` skill on the routes involved. Report what each wide and narrow screenshot shows, and any errors.
9. Commit only the task's files, with no AI attribution. Push the branch and open a pull request into `develop`. Report the pull request URL and the required checks. Do not wait for them, and do not merge.
10. When the task is done, archive it as the last commit on this branch, before the pull request merges. Done means the "Done when" list is met, including any hosted step the task file names. Do not open a separate branch or pull request for it.
    - `git mv` the task file into `docs/archive/tasks/`. Fix the relative links inside it that the move breaks: `../` becomes `../../`.
    - In the parcel, tick the task (`- [x]`) and point its link at the archived copy.
    - If every task in the parcel is now ticked, ask whether to move the parcel to `docs/archive/parcels/` in the same commit.
    - Push, and say in the pull request that the task is archived.
    - If the pull request is later closed without merging, move the file back to `docs/tasks/` and untick the task.
11. Stop. Do not start the next task.
