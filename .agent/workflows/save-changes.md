---
description: Save and commit all code changes made by Antigravity to Git
---

// turbo-all

## /save-changes workflow

Use this workflow after making code edits to commit all changes to the Git repository.

1. Stage all changed files:
```bash
git -C /home/rimefara/projects/life_tracker add -A
```

2. Commit with a timestamped message describing what was changed (replace `<summary>` with a brief description of what Antigravity changed):
```bash
git -C /home/rimefara/projects/life_tracker commit -m "antigravity: <summary> [$(date '+%Y-%m-%d %H:%M')]"
```

3. Show the commit result to confirm it succeeded:
```bash
git -C /home/rimefara/projects/life_tracker log --oneline -3
```
