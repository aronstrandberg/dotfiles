# set fish as default shell
if [ $SHELL != "/usr/local/bin/fish" ]; then
  if ! fgrep -q '/usr/local/bin/fish' /etc/shells; then
    echo '/usr/local/bin/fish' | sudo tee -a /etc/shells
  fi
  chsh -s /usr/local/bin/fish
fi

mkdir -p ~/.config
rsync -avh fish ~/.config

echo "Installed fish"
