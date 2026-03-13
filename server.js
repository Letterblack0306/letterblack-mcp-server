#!/usr/bin/env node

/**
 * MCP Knowledge Server - LetterBlack
 * Dynamically serves all files in knowledge_ingest/
 * Protocol: Model Context Protocol (MCP)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge_ingest');

// Dynamically scan all files in knowledge_ingest/ recursively
function scanKnowledgeFiles(dir, base = '') {
    const results = [];
    if (!fs.existsSync(dir)) return results;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const relPath = base ? `${base}/${entry.name}` : entry.name;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            results.push(...scanKnowledgeFiles(fullPath, relPath));
        } else if (entry.isFile()) {
            results.push({ relPath, fullPath });
        }
    }
    return results;
}

function getMimeType(filename) {
    if (filename.endsWith('.js')) return 'application/javascript';
    if (filename.endsWith('.json')) return 'application/json';
    if (filename.endsWith('.ts')) return 'application/typescript';
    return 'text/markdown';
}

const server = new Server(
    { name: 'letterblack-knowledge', version: '1.0.0' },
    { capabilities: { resources: {}, prompts: {} } }
);

// List all knowledge resources (dynamic)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const files = scanKnowledgeFiles(KNOWLEDGE_DIR);
    const resources = files.map(({ relPath }) => ({
        uri: `letterblack://knowledge/${relPath}`,
        mimeType: getMimeType(relPath),
        name: relPath,
        description: relPath,
    }));
    return { resources };
});

// Read specific resource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const match = uri.match(/^letterblack:\/\/knowledge\/(.+)$/);
    if (!match) throw new Error(`Invalid URI: ${uri}`);

    const relPath = match[1];
    const filePath = path.join(KNOWLEDGE_DIR, relPath);

    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${relPath}`);

    const content = fs.readFileSync(filePath, 'utf-8');
    return {
        contents: [{
            uri,
            mimeType: getMimeType(relPath),
            text: content,
        }]
    };
});

// List prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [{
        name: 'query-knowledge',
        description: 'Query LetterBlack knowledge base',
        arguments: [{
            name: 'query',
            description: 'Question about LetterBlack rules, contracts, or architecture',
            required: true
        }]
    }]
}));

// Get prompt
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name !== 'query-knowledge') throw new Error(`Unknown prompt: ${name}`);

    const query = args?.query || 'General query';
    const files = scanKnowledgeFiles(KNOWLEDGE_DIR);
    const docList = files.map(f => `- ${f.relPath}`).join('\n');

    return {
        messages: [{
            role: 'user',
            content: {
                type: 'text',
                text: `Query: "${query}"\n\nAvailable knowledge files:\n${docList}\n\nRead the relevant files and answer the query.`
            }
        }]
    };
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('LetterBlack Knowledge MCP server running on stdio');
}

main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
