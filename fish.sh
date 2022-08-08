# set fish as default shell
if [ $SHELL != "/opt/homebrew/bin/fish" ]; then
  if ! fgrep -q '/opt/homebrew/bin/fish' /etc/shells; then
    echo '/opt/homebrew/bin/fish' | sudo tee -a /etc/shells
  fi
  chsh -s /opt/homebrew/bin/fish
fi

mkdir -p ~/.config
rsync -avh fish ~/.config

echo "Installed fish"
