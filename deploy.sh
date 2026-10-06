#!/usr/bin/env bash
# Run on the EC2 instance: pulls the latest code, rebuilds, and restarts pm2.
set -euo pipefail

main() {
    cd "$(dirname "$0")"

    git pull --ff-only
    npm ci
    npm run build
    pm2 restart pa3 --update-env
    pm2 status pa3
}

# Everything is inside main() and we exit right after, so bash has already
# parsed the whole script before `git pull` can rewrite this file mid-run.
main "$@"
exit
