# git-push-commit.fish
# Rebase a commit onto master and push to a new remote branch.
#
# This is "stateless" - it uses a temporary git worktree so it never touches
# your current working directory or index. Safe to use while other processes
# (like another Claude) are operating on your local git state.
#
# Usage:
#   git-push-commit <commit-sha> [branch-name]
#
# Examples:
#   git-push-commit a635ecb                     # → origin/rebase-a635ecb
#   git-push-commit a635ecb my-feature-branch   # → origin/my-feature-branch

# Function definition with --description flag
# The description appears when you run `functions git-push-commit` or in completions
function git-push-commit --description "Rebase a commit onto master and push to new remote branch"

  # --- Argument handling ---
  # $argv is a list containing all arguments passed to the function
  # $argv[1] is the first argument, $argv[2] is the second, etc.
  # 'set -l' creates a local variable (scoped to this function only)
  set -l commit $argv[1]
  set -l branch $argv[2]

  # --- Input validation ---
  # 'test -z' returns true if the string is empty (zero length)
  # In fish, 'if' blocks end with 'end' (no 'fi' like bash)
  if test -z "$commit"
    echo "Usage: git-push-commit <commit-sha> [branch-name]"
    # 'return 1' exits the function with error status code 1
    return 1
  end

  # --- Default branch name ---
  # If no branch name provided, generate one from the commit SHA
  # 'string sub -l 7' extracts the first 7 characters (like short SHA)
  # Parentheses () perform command substitution (like $() in bash)
  if test -z "$branch"
    set branch "rebase-"(string sub -l 7 $commit)
  end

  # --- Setup temporary directory ---
  # 'mktemp -d' creates a temporary directory and returns its path
  set -l tmpdir (mktemp -d)

  # Store cleanup command as a string for reuse
  # We'll run this with 'eval' to clean up the worktree on exit
  # '2>/dev/null' suppresses error messages (worktree might not exist yet)
  set -l cleanup "git worktree remove --force $tmpdir 2>/dev/null"

  # --- Create worktree at the commit ---
  # Git worktrees let you have multiple working directories for one repo
  # --detach creates a detached HEAD at the specified commit
  # This lets us rebase just this commit onto origin/master
  #
  # 'if not <command>' runs the block if the command fails (non-zero exit)
  # This is fish's way of handling errors (no $? checking needed)
  if not git worktree add --quiet --detach $tmpdir $commit
    echo "Failed to create worktree at $commit"
    # Clean up the empty temp directory we created
    rm -rf $tmpdir
    return 1
  end

  # --- Fetch latest master ---
  # Ensure we have the latest origin/master to rebase onto
  if not git -C $tmpdir fetch --quiet origin master
    echo "Failed to fetch origin/master"
    eval $cleanup
    return 1
  end

  # --- Rebase the commit onto master ---
  # 'git rebase --onto <newbase> <upstream>' replays commits
  # HEAD~1 means "parent of current commit", so only HEAD is replayed
  #
  # Why rebase instead of cherry-pick?
  # Rebase uses 3-way merge which can resolve conflicts that cherry-pick can't.
  # Cherry-pick applies the exact diff, but rebase considers the merge-base.
  if not git -C $tmpdir rebase --quiet --onto origin/master HEAD~1
    echo "Rebase failed (likely conflicts). Aborting."
    git -C $tmpdir rebase --abort 2>/dev/null
    eval $cleanup
    return 1
  end

  # --- Push to remote ---
  # Push the rebased commit to a new branch on origin
  # 'HEAD:refs/heads/$branch' is a refspec:
  #   - HEAD = the rebased commit (source)
  #   - refs/heads/$branch = the branch name on remote (destination)
  if not git -C $tmpdir push --quiet origin HEAD:refs/heads/$branch
    echo "Push failed"
    eval $cleanup
    return 1
  end

  # --- Cleanup ---
  # Remove the temporary worktree (also deletes the temp directory)
  eval $cleanup

  # Success message
  echo "✓ Successfully rebased $commit onto master as origin/$branch"

  # Functions implicitly return 0 (success) if they reach the end
end
