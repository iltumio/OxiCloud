# Read the saved profile from file, or use default
saved_profile := `cat .just-profile 2>/dev/null || echo "default"`

[arg('PROFILE', pattern='^(default|full)$')]
envstart PROFILE='default':
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Starting environment with profile: {{PROFILE}}"
    echo "{{PROFILE}}" > .just-profile
    docker compose --profile {{PROFILE}} up -d

envstop:
    #!/usr/bin/env bash
    set -euo pipefail
    PROFILE=$(echo {{saved_profile}})
    echo "Stopping environment with profile: $PROFILE"
    docker compose --profile $PROFILE down