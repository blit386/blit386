#!/bin/sh

# Shared script to ensure pnpm is available (nvm, fnm, volta, Homebrew).

if [ -z "$(command -v pnpm)" ]; then
    if [ -n "$BASH_VERSION" ] || [ -n "$ZSH_VERSION" ]; then
        if [ -s "$HOME/.nvm/nvm.sh" ]; then
            . "$HOME/.nvm/nvm.sh"
        fi
    fi

    if [ -d "$HOME/.local/share/fnm" ]; then
        export PATH="$HOME/.local/share/fnm:$PATH"
        eval "$(fnm env)"
    fi

    if [ -d "$HOME/.fnm" ]; then
        export PATH="$HOME/.fnm:$PATH"
        if [ -n "$(command -v fnm)" ]; then
            eval "$(fnm env)"
        fi
    fi

    if [ -d "$HOME/.volta" ]; then
        export VOLTA_HOME="$HOME/.volta"
        export PATH="$VOLTA_HOME/bin:$PATH"
    fi

    if [ -d "/opt/homebrew/bin" ]; then
        export PATH="/opt/homebrew/bin:$PATH"
    fi

    if [ -d "/usr/local/bin" ]; then
        export PATH="/usr/local/bin:$PATH"
    fi

    export PATH="$HOME/.local/share/pnpm:$HOME/.pnpm-global/bin:$HOME/Library/pnpm:$PATH"
fi

if [ -z "$(command -v pnpm)" ]; then
    echo "Error: pnpm not found. Please ensure pnpm is installed and in your PATH."
    exit 1
fi
