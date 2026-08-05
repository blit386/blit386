# Guards against a placeholder/sandbox git identity (e.g. "Test <test@example.com>")
# getting baked into commit authorship. A local (non --global) `git config user.*`
# override in this repo's .git/config once came from a sandboxed session and
# silently overrode the correct ~/.gitconfig identity for every commit made here.
#
# Sourced by pre-commit and pre-push - not standalone, no shebang needed.

check_author_identity() {
    name="$1"
    email="$2"
    label="$3"

    bad=0

    case "$name" in
        "" | [Tt]est | "Your Name") bad=1 ;;
    esac

    case "$email" in
        "" | *@example.com | you@example.com) bad=1 ;;
    esac

    if [ "$bad" = "1" ]; then
        echo ""
        echo "[FAIL] $label looks like a placeholder identity: \"$name <$email>\"."
        echo "       This is usually a LOCAL .git/config override, not your ~/.gitconfig."
        echo "       Check: git config --local --get-regexp '^user\\.'"
        echo "       Fix:   git config --local --unset user.name && git config --local --unset user.email"
        exit 1
    fi
}
