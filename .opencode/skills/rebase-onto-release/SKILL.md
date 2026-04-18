---
name: rebase-onto-release
description: "Rebases local commits onto the latest upstream version tag, resolves conflicts intelligently, force-pushes, and builds. Use when the user asks to rebase onto latest release, sync with upstream tag, update fork to latest version, or build the local fork."
---

# Rebase onto latest upstream release tag

Rebases the current branch's non-upstream commits onto the newest `v*` release tag from `upstream`, resolves any merge conflicts, force-pushes to `origin`, and optionally builds a local binary pinned to the base release version.

## Workflow

### 1. Gather state

Run these in parallel:

```bash
git fetch upstream --tags
git remote -v
git log --oneline -20
git branch --show-current
```

### 2. Identify target tag and commits to rebase

```bash
# Find latest version tag (exclude non-release tags like vscode-*)
git tag -l 'v[0-9]*' --sort=-v:refname | head -1
```

Find the base tag the current branch was built on top of:

```bash
# Walk version tags newest-first until one is an ancestor of HEAD
for tag in $(git tag -l 'v[0-9]*' --sort=-v:refname); do
  git merge-base --is-ancestor "$tag" HEAD && echo "$tag" && break
done
```

Verify which commits will be rebased:

```bash
git log --oneline <base-tag>..HEAD
```

If `<base-tag>` equals the latest tag, the branch is already up to date. Inform the user and stop.

### 3. Rebase

```bash
git rebase --onto <latest-tag> <base-tag> <current-branch>
```

### 4. Resolve conflicts

If the rebase pauses with conflicts:

1. For each conflicted file, run `git diff <base-tag> <your-commit> -- <file>` to understand **your** intent.
2. Read the conflict markers. Decide per-hunk:
   - **Your commit didn't change this area**: take HEAD (upstream).
   - **Upstream refactored code your commit touched**: apply your logical change on top of upstream's new structure.
   - **Both sides changed independently**: merge both changes.
3. Stage resolved files and continue:
   ```bash
   git add <resolved-files>
   GIT_EDITOR="true" git rebase --continue
   ```
4. Repeat for each commit that conflicts.

### 5. Verify

```bash
git log --oneline <latest-tag>..HEAD   # confirm your commits sit on top
```

### 6. Push

```bash
git push origin <current-branch> --force
```

If the push is rejected by a pre-push hook (e.g. typecheck), fix the errors, amend the relevant commit, and retry.

### 7. Pin the default branch to the release tag

If the fork's default branch (e.g. `dev`) is not already at `<latest-tag>`, reset it so that PRs against it only show your own commits:

```bash
git checkout dev
git reset --hard <latest-tag>
git push origin dev --force
git checkout <current-branch>
```

This prevents GitHub PRs from including unrelated upstream commits in the diff. **Do not use GitHub's "Sync fork" button afterwards**, as it will advance `dev` to the upstream tip and pollute the PR again.

---

## Build

Build a local binary using the base release tag version. This avoids the startup delay caused by `@npmcli/arborist` trying to resolve a non-existent preview version from npm.

### Why version matters

During startup, opencode runs `npm install @opencode-ai/plugin@<version>` for each config directory. The install is `forkDetach`'d (non-blocking for config), but `Plugin.init()` calls `waitForDependencies()` which joins all npm fibers. If the version doesn't exist on npm (e.g. `0.0.0-feat-xxx-...`), arborist will hit the registry and wait for a timeout (~30-60s), blocking the entire bootstrap and making all TUI elements (models, cwd, version) hang.

### Determine the base version

Find the release tag the current branch is based on (same as step 2 above), then strip the `v` prefix:

```bash
BASE_TAG=$(for tag in $(git tag -l 'v[0-9]*' --sort=-v:refname); do
  git merge-base --is-ancestor "$tag" HEAD && echo "$tag" && break
done)
BASE_VERSION="${BASE_TAG#v}"
echo "Base version: $BASE_VERSION"
```

### Build command

```bash
OPENCODE_VERSION="$BASE_VERSION" ./packages/opencode/script/build.ts --single
```

- `OPENCODE_VERSION` is injected as `OPENCODE_VERSION` define at compile time via `packages/script/src/index.ts`. When set to a real release version (e.g. `1.4.12`), the channel auto-resolves to `latest` and `InstallationLocal` becomes `false`.
- `--single` builds only for the current platform/arch (skips cross-compilation).
- The output binary is at `packages/opencode/dist/opencode-ai-{os}-{arch}/bin/opencode`.

### One-liner

```bash
OPENCODE_VERSION="$(git tag -l 'v[0-9]*' --sort=-v:refname | while read tag; do git merge-base --is-ancestor "$tag" HEAD 2>/dev/null && echo "${tag#v}" && break; done)" ./packages/opencode/script/build.ts --single
```
