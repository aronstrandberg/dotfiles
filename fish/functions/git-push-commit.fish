# git-push-commit.fish
# Cherry-pick a commit onto master and push to a new remote branch.
#
# This is "stateless" - it uses a temporary git worktree so it never touches
# your current working directory or index. Safe to use while other processes
# (like another Claude) are operating on your local git state.
#
# Usage:
#   git-push-commit <commit-sha> [branch-name]
#
# Examples:
#   git-push-commit a635ecb                     # → origin/cherry-pick-a635ecb
#   git-push-commit a635ecb my-feature-branch   # → origin/my-feature-branch

# Function definition with --description flag
# The description appears when you run `functions git-push-commit` or in completions
function git-push-commit --description "Cherry-pick a commit onto master and push to new remote branch"

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
    set branch "cherry-pick-"(string sub -l 7 $commit)
  end

  # --- Setup temporary directory ---
  # 'mktemp -d' creates a temporary directory and returns its path
  set -l tmpdir (mktemp -d)

  # Store cleanup command as a string for reuse
  # We'll run this with 'eval' to clean up the worktree on exit
  # '2>/dev/null' suppresses error messages (worktree might not exist yet)
  set -l cleanup "git worktree remove --force $tmpdir 2>/dev/null"

  # --- Create worktree ---
  # Git worktrees let you have multiple working directories for one repo
  # This creates a new working directory at $tmpdir, checked out to origin/master
  # --quiet suppresses the "Preparing worktree" message
  #
  # 'if not <command>' runs the block if the command fails (non-zero exit)
  # This is fish's way of handling errors (no $? checking needed)
  if not git worktree add --quiet $tmpdir origin/master
    echo "Failed to create worktree"
    # Clean up the empty temp directory we created
    rm -rf $tmpdir
    return 1
  end

  # --- Cherry-pick the commit ---
  # 'git -C <path>' runs git as if started in that directory
  # This is key: we're operating in the worktree, not our current directory
  #
  # Cherry-pick replays the commit's changes onto the current HEAD (origin/master)
  # creating a NEW commit with a new SHA (since it has a different parent)
  if not git -C $tmpdir cherry-pick --quiet $commit
    echo "Cherry-pick failed (likely conflicts). Aborting."
    # 'eval' executes a string as a command
    eval $cleanup
    return 1
  end

  # --- Push to remote ---
  # Push the new commit to a new branch on origin
  # 'HEAD:refs/heads/$branch' is a refspec:
  #   - HEAD = the commit we just created (source)
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
  echo "✓ Successfully pushed $commit onto master as origin/$branch"

  # Functions implicitly return 0 (success) if they reach the end
end
