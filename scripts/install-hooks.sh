#!/bin/bash
# ClaudeCron Hook Installation Script

set -euo pipefail

CLAUDE_DIR="${HOME}/.claude"
HOOKS_DIR="${CLAUDE_DIR}/hooks"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Installing ClaudeCron hooks..."

# Create hooks directory if it doesn't exist
mkdir -p "$HOOKS_DIR"

# Copy hook scripts
echo "Copying hook scripts to $HOOKS_DIR..."
cp "${PROJECT_DIR}/.claude/hooks"/*.sh "$HOOKS_DIR/"

# Make scripts executable
chmod +x "$HOOKS_DIR"/*.sh

# Backup existing settings.json
if [ -f "${CLAUDE_DIR}/settings.json" ]; then
  cp "${CLAUDE_DIR}/settings.json" "${CLAUDE_DIR}/settings.json.backup.$(date +%s)"
  echo "Backed up existing settings.json"
fi

# Merge with existing settings or create new
if [ -f "${CLAUDE_DIR}/settings.json" ]; then
  # Merge hooks configuration
  echo "Merging hook configuration with existing settings..."
  jq -s '.[0] * .[1]' \
    "${CLAUDE_DIR}/settings.json" \
    "${PROJECT_DIR}/.claude/hooks/settings.json.template" \
    > "${CLAUDE_DIR}/settings.json.tmp"
  mv "${CLAUDE_DIR}/settings.json.tmp" "${CLAUDE_DIR}/settings.json"
else
  # Create new settings
  echo "Creating new settings.json..."
  cp "${PROJECT_DIR}/.claude/hooks/settings.json.template" "${CLAUDE_DIR}/settings.json"
fi

echo ""
echo "ClaudeCron hooks installed successfully!"
echo ""
echo "Hook scripts installed to: $HOOKS_DIR"
echo "Settings updated at: ${CLAUDE_DIR}/settings.json"
echo ""
echo "To verify installation, restart Claude Code and check logs."
echo ""
echo "To enable debug logging, set CLAUDECRON_DEBUG=1 environment variable."
