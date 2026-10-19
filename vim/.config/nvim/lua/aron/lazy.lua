local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
local uv = vim.uv or vim.loop

if not uv.fs_stat(lazypath) then
  local lazyrepo = "https://github.com/folke/lazy.nvim.git"
  local output = vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "--branch=stable",
    lazyrepo,
    lazypath,
  })

  if vim.v.shell_error ~= 0 then
    error("Failed to install lazy.nvim:\n" .. output)
  end
end

vim.opt.rtp:prepend(lazypath)

require("lazy").setup({
  spec = {
    {
      "Shatur/neovim-ayu",
      lazy = false,
      priority = 1000,
      config = function()
        require("ayu").setup({
          mirage = false,
          terminal = true,
          overrides = {},
        })

        vim.cmd.colorscheme("ayu-dark")
      end,
    },
    {
      "nvim-lualine/lualine.nvim",
      opts = {
        options = {
          component_separators = "",
          globalstatus = true,
          icons_enabled = false,
          section_separators = "",
          theme = "ayu",
        },
      },
    },
    {
      "lewis6991/gitsigns.nvim",
      event = { "BufReadPre", "BufNewFile" },
      opts = {
        current_line_blame = true,
        current_line_blame_opts = {
          delay = 500,
        },
      },
    },
    {
      "folke/which-key.nvim",
      event = "VeryLazy",
      opts = {},
    },
    {
      "nvim-telescope/telescope.nvim",
      version = "*",
      dependencies = { "nvim-lua/plenary.nvim" },
      cmd = "Telescope",
      keys = {
        { "<leader>ff", "<cmd>Telescope find_files<CR>", desc = "Find files" },
        { "<leader>fg", "<cmd>Telescope live_grep<CR>", desc = "Live grep" },
        { "<leader>fb", "<cmd>Telescope buffers<CR>", desc = "Find buffers" },
        { "<leader>fh", "<cmd>Telescope help_tags<CR>", desc = "Help tags" },
      },
      opts = function()
        local actions = require("telescope.actions")

        return {
          defaults = {
            layout_config = {
              horizontal = {
                preview_width = 0.55,
              },
            },
            mappings = {
              i = {
                ["<Esc>"] = actions.close,
              },
            },
          },
        }
      end,
    },
    {
      "nvim-treesitter/nvim-treesitter",
      dependencies = { "neovim-treesitter/treesitter-parser-registry" },
      lazy = false,
      build = ":TSUpdate",
      config = function()
        local languages = {
          "bash",
          "fish",
          "gitcommit",
          "go",
          "javascript",
          "json",
          "lua",
          "markdown",
          "markdown_inline",
          "ruby",
          "toml",
          "vim",
          "vimdoc",
          "yaml",
        }

        -- tree-sitter is installed by the Brewfile; skip parser compilation
        -- if Neovim starts before Homebrew has installed it.
        if vim.fn.executable("tree-sitter") == 1 then
          require("nvim-treesitter").install(languages)
        end

        vim.api.nvim_create_autocmd("FileType", {
          pattern = languages,
          callback = function()
            local has_parser = pcall(vim.treesitter.start)

            if has_parser then
              vim.bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
            end
          end,
        })
      end,
    },
  },
  change_detection = {
    notify = false,
  },
  checker = {
    enabled = true,
    notify = false,
  },
  install = {
    colorscheme = { "ayu-dark", "ayu" },
  },
})
