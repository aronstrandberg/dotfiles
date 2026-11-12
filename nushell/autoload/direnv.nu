# Load direnv environments before each prompt.
$env.config = ($env.config | upsert hooks.pre_prompt (
    $env.config.hooks.pre_prompt? | default [] | append {||
        if (which direnv | is-empty) { return }
        direnv export json | from json | default {} | load-env
        if 'ENV_CONVERSIONS' in $env and 'PATH' in $env.ENV_CONVERSIONS {
            $env.PATH = do $env.ENV_CONVERSIONS.PATH.from_string $env.PATH
        }
    }
))
