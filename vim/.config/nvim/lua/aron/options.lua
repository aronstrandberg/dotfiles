vim.g.mapleader = " "
vim.g.maplocalleader = " "

local opt = vim.opt

opt.backspace = { "indent", "eol", "start" }
opt.breakindent = true
opt.clipboard = "unnamedplus"
opt.completeopt = { "menu", "menuone", "noselect" }
opt.cursorline = true
opt.expandtab = true
opt.fillchars = { eob = " " }
opt.foldlevel = 99
opt.foldmethod = "indent"
opt.hlsearch = true
opt.ignorecase = true
opt.incsearch = true
opt.laststatus = 3
opt.linebreak = true
opt.list = true
opt.listchars = { tab = "> ", trail = ".", extends = ">", nbsp = "." }
opt.mouse = "a"
opt.number = true
opt.pumheight = 10
opt.relativenumber = true
opt.scrolloff = 5
opt.shiftround = true
opt.shiftwidth = 2
opt.shortmess:append("c")
opt.showmode = false
opt.signcolumn = "yes"
opt.smartcase = true
opt.smartindent = true
opt.softtabstop = 2
opt.splitbelow = true
opt.splitright = true
opt.swapfile = false
opt.tabstop = 2
opt.termguicolors = true
opt.timeoutlen = 400
opt.undofile = true
opt.updatetime = 250
opt.wrap = true

vim.o.background = "dark"
