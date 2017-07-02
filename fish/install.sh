# set fish as default shell
if ! fgrep -q '/usr/local/bin/fish' /etc/shells; then
  echo '/usr/local/bin/fish' | sudo tee -a /etc/shells
fi
chsh -s /usr/local/bin/fish

# install oh-my-fish
curl -L https://github.com/oh-my-fish/oh-my-fish/raw/master/bin/install | fish

# install oh-my-fish packes
omf install fasd
