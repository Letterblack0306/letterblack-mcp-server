# letterblack-mcp-server

MCP server for LetterBlack knowledge base.

## Setup
```
npm install
```

## Usage
Drop any `.md`, `.js`, or `.json` files into `knowledge_ingest/` — they are served automatically.

## Claude Desktop config
```json
{
  "mcpServers": {
    "letterblack-knowledge": {
      "command": "node",
      "args": ["D:\\Developement\\letterblack-mcp-server\\server.js"]
    }
  }
}
```
