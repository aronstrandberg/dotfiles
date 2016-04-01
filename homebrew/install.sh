# set permissions something something
sudo chown -R $(whoami):admin /usr/local

# install homebrew
ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"

# install homebrew packages
brew tap homebrew/bundle
brew bundle
