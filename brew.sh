
# install homebrew if not present
which -s brew
if [[ $? != 0 ]] ; then
  # install homebrew
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install.sh)"
else
  # upgrade homebrew
  brew update
  # upgrade homebrew formulas
  brew upgrade
fi

# install homebrew packages
brew tap homebrew/bundle
brew bundle
