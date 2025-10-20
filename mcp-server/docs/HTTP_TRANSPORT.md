# HTTP Transport for ClaudeCron MCP Server

## Overview

The ClaudeCron MCP server now supports HTTP transport for remote access, in addition to the default STDIO transport for local process communication. This enables the server to be deployed as a standalone HTTP service that can be accessed by remote MCP clients.

## Configuration

### Basic HTTP Configuration

Add the `http` section to your ClaudeCron configuration file (`.claude/claudecron.json` or `~/.claude/claudecron/config.json`):

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
    "cors": {
      "enabled": true,
      "origins": ["*"]
    }
  }
}
```

### Authentication Configuration

For production deployments, **always enable authentication**. ClaudeCron supports two authentication methods:

#### Bearer Token Authentication

```json
{
  "http": {
    "port": 3000,
    "host": "0.0.0.0",
    "auth": {
      "type": "bearer",
      "token": "your-secret-bearer-token-here"
    }
  }
}
```

Clients must include the token in the `Authorization` header:
```
Authorization: Bearer your-secret-bearer-token-here
```

#### API Key Authentication

```json
{
  "http": {
    "port": 3000,
    "host": "0.0.0.0",
    "auth": {
      "type": "apikey",
      "token": "your-secret-api-key",
      "header": "X-API-Key"
    }
  }
}
```

Clients must include the key in the specified header:
```
X-API-Key: your-secret-api-key
```

### CORS Configuration

Control which origins can access your server:

```json
{
  "http": {
    "cors": {
      "enabled": true,
      "origins": ["https://app.example.com", "https://admin.example.com"]
    }
  }
}
```

## Starting the Server

### Environment Variable

Set the transport type via environment variable:

```bash
CLAUDECRON_TRANSPORT=http node dist/server.js
```

### Configuration File

Or specify in your config file:

```json
{
  "transport": "http"
}
```

## HTTP API Endpoints

### POST /mcp

Send MCP JSON-RPC requests to the server.

**Headers:**
- `Content-Type: application/json`
- `Mcp-Session-Id: <session-id>` (after initialization)
- `Authorization: Bearer <token>` (if auth enabled)

**Request Body:**
Standard MCP JSON-RPC message.

**Response:**
- For initialization requests: Returns session ID in `Mcp-Session-Id` header
- For other requests: Returns JSON-RPC response

### GET /mcp

Establish Server-Sent Events (SSE) stream for receiving server messages.

**Headers:**
- `Mcp-Session-Id: <session-id>` (required)
- `Last-Event-ID: <event-id>` (optional, for resumability)
- `Authorization: Bearer <token>` (if auth enabled)

**Response:**
SSE stream with MCP messages.

### DELETE /mcp

Terminate an MCP session.

**Headers:**
- `Mcp-Session-Id: <session-id>` (required)
- `Authorization: Bearer <token>` (if auth enabled)

**Response:**
- `200 OK` on success
- `400 Bad Request` for invalid session

### GET /health

Health check endpoint (no authentication required).

**Response:**
```json
{
  "status": "ok",
  "service": "claudecron-mcp-server",
  "version": "2.0.0",
  "transport": "http",
  "activeSessions": 3
}
```

## Client Connection Example

### Using cURL (Initialization)

```bash
# Initialize session
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "example-client",
        "version": "1.0.0"
      }
    },
    "id": 1
  }' -v
```

Look for the `Mcp-Session-Id` header in the response.

### Using JavaScript/TypeScript

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport({
  url: 'http://localhost:3000/mcp',
  headers: {
    'Authorization': 'Bearer your-token'
  }
});

const client = new Client({
  name: 'example-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);

// Use the client
const tools = await client.listTools();
console.log(tools);
```

## Security Best Practices

1. **Always use authentication** in production
2. **Use HTTPS** in production (put behind reverse proxy like nginx or Caddy)
3. **Restrict CORS origins** to known clients only
4. **Use strong, randomly generated tokens** (e.g., via `openssl rand -base64 32`)
5. **Bind to localhost** for local-only access, or **0.0.0.0** for network access
6. **Monitor active sessions** via the `/health` endpoint
7. **Set up proper logging** and monitoring for production deployments

## Example Deployment with nginx

```nginx
server {
    listen 443 ssl http2;
    server_name claudecron.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /mcp {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Important for SSE
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
    }

    location /health {
        proxy_pass http://localhost:3000;
    }
}
```

## Troubleshooting

### Connection Refused
- Check that the server is running
- Verify the port and host configuration
- Check firewall rules

### Authentication Failures
- Verify token is correct
- Check header name (Bearer vs API key)
- Review server logs for detailed error messages

### CORS Errors
- Add client origin to `cors.origins` array
- Ensure `cors.enabled` is `true`
- Check browser console for specific CORS error

### Session Errors
- Ensure you're sending `Mcp-Session-Id` header after initialization
- Check that session hasn't expired
- Verify session ID matches what was returned during initialization

## Logging

All HTTP transport operations are logged with the `[HTTP Transport]` prefix:

```
[HTTP Transport] Server listening on http://localhost:3000/mcp
[HTTP Transport] Health check: http://localhost:3000/health
[HTTP Transport] Authentication enabled: bearer
[HTTP Transport] POST request (new)
[HTTP Transport] Session initialized: 123e4567-e89b-12d3-a456-426614174000
[HTTP Transport] Establishing SSE stream for session 123e4567-e89b-12d3-a456-426614174000
```

## Comparison: STDIO vs HTTP

| Feature | STDIO | HTTP |
|---------|-------|------|
| **Use Case** | Local process communication | Remote/network access |
| **Security** | Isolated by OS process | Requires authentication |
| **Performance** | Faster (no network overhead) | Network latency applies |
| **Deployment** | Simple (single process) | Can run as service |
| **Scaling** | One client per process | Multiple concurrent clients |
| **Debugging** | Harder to inspect traffic | Can use browser/curl |
| **Production** | IDE/CLI tools | Web applications, dashboards |

## Default Configuration

If no HTTP configuration is provided, these defaults are used:

```json
{
  "http": {
    "port": 3000,
    "host": "localhost",
    "auth": {
      "type": "none"
    },
    "cors": {
      "enabled": true,
      "origins": ["*"]
    }
  }
}
```

**WARNING:** Default configuration has no authentication enabled. Always configure authentication for production use.
