# theme based on https://github.com/oh-my-fish/theme-eclm

function git_branch
  echo (command git symbolic-ref HEAD ^/dev/null | sed -e 's|^refs/heads/||')
end

function git_dirty_status
  echo (command git status -s --ignore-submodules=dirty ^/dev/null)
end

function current_directory
  echo -n $PWD | sed -e "s|^$HOME|~|"
end

function fish_prompt
  set -l last_status $status
  set -l cyan (set_color -o cyan)
  set -l yellow (set_color -o yellow)
  set -l red (set_color -o red)
  set -l blue (set_color -o blue)
  set -l green (set_color -o green)
  set -l normal (set_color normal)

  set -l cwd $cyan(current_directory)

  if [ (git_branch) ]
    if test (git_branch) = 'master'
      set -l git_branch (git_branch)
      set git_info "$normal ($red$git_branch$normal)"
    else
      set -l git_branch (git_branch)
      set git_info "$normal ($yellow$git_branch$normal)"
    end

    if [ (git_dirty_status) ]
      set -l dirty "$yellow ✗"
      set git_info "$git_info$dirty"
    end
  end

  echo -n -s $cwd $git_info $normal ' '
end
