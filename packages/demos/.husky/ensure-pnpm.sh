#!/bin/sh

# Shared script to ensure pnpm is available
# This handles nvm, fnm, volta, and other version managers

# Try to find pnpm in common locations
if [ -z "$(command -v pnpm)" ]; then
    # Try nvm
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        . "$HOME/.nvm/nvm.sh"
    fi

    # Try fnm (default installation path)
    if [ -d "$HOME/.local/share/fnm" ]; then
        export PATH="$HOME/.local/share/fnm:$PATH"
        eval "$(fnm env)"
    fi

    # Try fnm (alternative installation path)
    if [ -d "$HOME/.fnm" ]; then
        export PATH="$HOME/.fnm:$PATH"
        if [ -n "$(command -v fnm)" ]; then
            eval "$(fnm env)"
        fi
    fi

    # Try volta
    if [ -d "$HOME/.volta" ]; then
        export VOLTA_HOME="$HOME/.volta"
        export PATH="$VOLTA_HOME/bin:$PATH"
    fi

    # Try Homebrew Node on macOS (Apple Silicon)
    if [ -d "/opt/homebrew/bin" ]; then
        export PATH="/opt/homebrew/bin:$PATH"
    fi

    # Try Homebrew Node on macOS (Intel)
    if [ -d "/usr/local/bin" ]; then
        export PATH="/usr/local/bin:$PATH"
    fi

    # Try common global npm/pnpm locations
    export PATH="$HOME/.local/share/pnpm:$HOME/.pnpm-global/bin:$HOME/Library/pnpm:$PATH"
fi

# Final check for pnpm
if [ -z "$(command -v pnpm)" ]; then
    echo "Error: pnpm not found. Please ensure pnpm is installed and in your PATH."
    exit 1
fi
