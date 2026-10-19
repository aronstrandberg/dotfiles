# set zed as the default Finder app for code files (requires duti from brewfile)

if ! command -v duti >/dev/null 2>&1; then
  echo "duti not found; run brew.sh first"
  exit 1
fi

zed_bundle_id='dev.zed.Zed'

# code extensions only — plain .txt and .md keep their existing default
code_extensions='ts tsx js jsx mjs cjs go py rb rs c h cpp cc cxx hpp java kt kts swift m mm php lua pl sh bash zsh fish sql json jsonc yaml yml toml xml css scss sass less html htm vue svelte astro gradle dart ex exs erl hs clj cljs scala jl proto graphql gql tf tfvars'

for ext in $code_extensions; do
  duti -s "$zed_bundle_id" ".$ext" all
done

echo "Set Zed as default editor for code files"
