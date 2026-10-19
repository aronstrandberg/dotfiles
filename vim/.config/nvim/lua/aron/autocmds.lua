local group = vim.api.nvim_create_augroup("aron", { clear = true })

vim.api.nvim_create_autocmd("TextYankPost", {
  group = group,
  callback = function()
    vim.highlight.on_yank({ timeout = 150 })
  end,
})

vim.api.nvim_create_autocmd("BufReadPost", {
  group = group,
  callback = function()
    local mark = vim.api.nvim_buf_get_mark(0, '"')
    local line_count = vim.api.nvim_buf_line_count(0)

    if mark[1] > 0 and mark[1] <= line_count then
      pcall(vim.api.nvim_win_set_cursor, 0, mark)
    end
  end,
})

vim.api.nvim_create_autocmd("BufWritePre", {
  group = group,
  callback = function(event)
    local dirname = vim.fn.fnamemodify(event.match, ":p:h")

    if vim.fn.isdirectory(dirname) == 0 then
      vim.fn.mkdir(dirname, "p")
    end
  end,
})
