# ClaudeCron Examples

This directory contains example configurations and scripts for ClaudeCron MCP Server.

## HTTP Transport Examples

### Configuration File

**http-config.json** - Example configuration for running ClaudeCron with HTTP transport

```bash
# Start server with HTTP transport
cd mcp-server
node dist/server.js ../examples/http-config.json
```

Or set environment variable:

```bash
CLAUDECRON_TRANSPORT=http node dist/server.js
```

### Test Script

**test-http-transport.sh** - Test script for HTTP endpoints

Before running, update the TOKEN in the script to match your configuration:

```bash
# Edit the script
nano test-http-transport.sh

# Update this line:
TOKEN="replace-with-your-secret-token"

# Run the test
./test-http-transport.sh
```

## Configuration Options

### STDIO Transport (Default)

```json
{
  "storage": {
    "type": "sqlite",
    "path": "~/.claude/claudecron/tasks.db"
  },
  "transport": "stdio"
}
```

### HTTP Transport (Remote Access)

```json
{
  "storage": {
    "type": "sqlite",
    "path": "~/.claude/claudecron/tasks.db"
  },
  "transport": "http",
  "http": {
    "port": 3000,
    "host": "localhost",
    "auth": {
      "type": "bearer",
      "token": "your-secret-token"
    },
    "cors": {
      "enabled": true,
      "origins": ["https://yourapp.com"]
    }
  }
}
```

### PostgreSQL Storage

```json
{
  "storage": {
    "type": "postgres",
    "url": "postgresql://user:password@localhost:5432/claudecron"
  },
  "transport": "stdio"
}
```

## Authentication Types

### Bearer Token

```json
{
  "http": {
    "auth": {
      "type": "bearer",
      "token": "your-bearer-token"
    }
  }
}
```

Client usage:
```bash
curl -H "Authorization: Bearer your-bearer-token" http://localhost:3000/mcp
```

### API Key

```json
{
  "http": {
    "auth": {
      "type": "apikey",
      "token": "your-api-key",
      "header": "X-API-Key"
    }
  }
}
```

Client usage:
```bash
curl -H "X-API-Key: your-api-key" http://localhost:3000/mcp
```

### No Authentication (Development Only)

```json
{
  "http": {
    "auth": {
      "type": "none"
    }
  }
}
```

**WARNING:** Never use `type: "none"` in production!

## Generating Secure Tokens

```bash
# Generate a random Bearer token
openssl rand -base64 32

# Generate a random API key
openssl rand -hex 32

# Generate a UUID
uuidgen
```

## See Also

- [HTTP Transport Documentation](../mcp-server/docs/HTTP_TRANSPORT.md)
- [Main README](../README.md)
