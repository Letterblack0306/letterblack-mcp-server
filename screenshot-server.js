#!/usr/bin/env node

/**
 * MCP Screenshot Tool - LetterBlack
 * Captures the screen and returns it as base64 for AI vision analysis
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import screenshot from 'screenshot-desktop';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = new Server(
    { name: 'letterblack-screenshot', version: '1.0.0' },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'take_screenshot',
            description: 'Capture the current screen and return it as a base64 image for analysis',
            inputSchema: {
                type: 'object',
                properties: {
                    display: {
                        type: 'number',
                        description: 'Display index to capture (0 = primary). Optional.',
                    }
                },
                required: []
            }
        },
        {
            name: 'save_screenshot',
            description: 'Capture and save screenshot to a file, returns the file path',
            inputSchema: {
                type: 'object',
                properties: {
                    filename: {
                        type: 'string',
                        description: 'Output filename (e.g. screen.png). Saved to screenshots/ folder.'
                    }
                },
                required: []
            }
        }
    ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'take_screenshot') {
        try {
            const options = {};
            if (args?.display !== undefined) options.screen = args.display;

            const imgBuffer = await screenshot(options);
            const base64 = imgBuffer.toString('base64');

            return {
                content: [
                    {
                        type: 'text',
                        text: `Screenshot captured (${imgBuffer.length} bytes). Base64 image below:`
                    },
                    {
                        type: 'image',
                        data: base64,
                        mimeType: 'image/png'
                    }
                ]
            };
        } catch (err) {
            return {
                content: [{ type: 'text', text: `Screenshot failed: ${err.message}` }],
                isError: true
            };
        }
    }

    if (name === 'save_screenshot') {
        try {
            const dir = path.join(__dirname, 'screenshots');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir);

            const filename = args?.filename || `screen-${Date.now()}.png`;
            const outPath = path.join(dir, filename);

            const imgBuffer = await screenshot();
            fs.writeFileSync(outPath, imgBuffer);

            return {
                content: [{ type: 'text', text: `Screenshot saved to: ${outPath}` }]
            };
        } catch (err) {
            return {
                content: [{ type: 'text', text: `Save failed: ${err.message}` }],
                isError: true
            };
        }
    }

    throw new Error(`Unknown tool: ${name}`);
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('LetterBlack Screenshot MCP server running on stdio');
}

main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
