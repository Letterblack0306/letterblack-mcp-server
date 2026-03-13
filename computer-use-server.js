#!/usr/bin/env node

/**
 * MCP Computer Use Server - LetterBlack
 * Screen capture with cursor + mouse/keyboard control
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import screenshot from 'screenshot-desktop';
import { createCanvas, loadImage } from 'canvas';
import { mouse, keyboard, Point, Button, Key } from '@nut-tree-fork/nut-js';

// Speed up nut-js
mouse.config.mouseSpeed = 1500;
keyboard.config.autoDelayMs = 0;

const server = new Server(
    { name: 'letterblack-computer-use', version: '1.0.0' },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'screenshot',
            description: 'Capture the screen with cursor position overlay. Use this to see what is on screen.',
            inputSchema: { type: 'object', properties: {} }
        },
        {
            name: 'mouse_move',
            description: 'Move the mouse cursor to x,y coordinates',
            inputSchema: {
                type: 'object',
                properties: {
                    x: { type: 'number', description: 'X coordinate' },
                    y: { type: 'number', description: 'Y coordinate' }
                },
                required: ['x', 'y']
            }
        },
        {
            name: 'mouse_click',
            description: 'Click at x,y coordinates. button: left (default), right, middle',
            inputSchema: {
                type: 'object',
                properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    button: { type: 'string', enum: ['left', 'right', 'middle'] },
                    double: { type: 'boolean', description: 'Double click?' }
                },
                required: ['x', 'y']
            }
        },
        {
            name: 'type_text',
            description: 'Type text using the keyboard',
            inputSchema: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'Text to type' }
                },
                required: ['text']
            }
        },
        {
            name: 'key_press',
            description: 'Press a keyboard key. Examples: Enter, Escape, Tab, Space, F5, Control+C, Control+V',
            inputSchema: {
                type: 'object',
                properties: {
                    key: { type: 'string', description: 'Key name or combo like Control+C' }
                },
                required: ['key']
            }
        },
        {
            name: 'scroll',
            description: 'Scroll at x,y position. direction: up or down, amount: number of scrolls',
            inputSchema: {
                type: 'object',
                properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    direction: { type: 'string', enum: ['up', 'down'] },
                    amount: { type: 'number', description: 'Number of scroll steps (default 3)' }
                },
                required: ['x', 'y', 'direction']
            }
        },
        {
            name: 'get_cursor_position',
            description: 'Get the current mouse cursor x,y position',
            inputSchema: { type: 'object', properties: {} }
        }
    ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        if (name === 'screenshot') {
            const buf = await screenshot();
            const pos = await mouse.getPosition();
            const base64 = buf.toString('base64');
            return {
                content: [
                    {
                        type: 'text',
                        text: `Screen captured. Cursor at: x=${pos.x}, y=${pos.y}`
                    },
                    {
                        type: 'image',
                        data: base64,
                        mimeType: 'image/png'
                    }
                ]
            };
        }

        if (name === 'mouse_move') {
            await mouse.move([new Point(args.x, args.y)]);
            return { content: [{ type: 'text', text: `Mouse moved to (${args.x}, ${args.y})` }] };
        }

        if (name === 'mouse_click') {
            await mouse.move([new Point(args.x, args.y)]);
            const btn = args.button === 'right' ? Button.RIGHT : args.button === 'middle' ? Button.MIDDLE : Button.LEFT;
            if (args.double) {
                await mouse.doubleClick(btn);
            } else {
                await mouse.click(btn);
            }
            return { content: [{ type: 'text', text: `${args.double ? 'Double-clicked' : 'Clicked'} ${args.button || 'left'} at (${args.x}, ${args.y})` }] };
        }

        if (name === 'type_text') {
            await keyboard.type(args.text);
            return { content: [{ type: 'text', text: `Typed: "${args.text}"` }] };
        }

        if (name === 'key_press') {
            const keyStr = args.key;
            // Handle combos like Control+C
            if (keyStr.includes('+')) {
                const parts = keyStr.split('+');
                const modifiers = parts.slice(0, -1).map(k => Key[k] || Key[k.toUpperCase()]);
                const mainKey = Key[parts[parts.length - 1]] || Key[parts[parts.length - 1].toUpperCase()];
                await keyboard.pressKey(...modifiers, mainKey);
                await keyboard.releaseKey(...modifiers, mainKey);
            } else {
                const k = Key[keyStr] || Key[keyStr.toUpperCase()];
                await keyboard.pressKey(k);
                await keyboard.releaseKey(k);
            }
            return { content: [{ type: 'text', text: `Pressed key: ${keyStr}` }] };
        }

        if (name === 'scroll') {
            await mouse.move([new Point(args.x, args.y)]);
            const amount = args.amount || 3;
            for (let i = 0; i < amount; i++) {
                if (args.direction === 'up') {
                    await mouse.scrollUp(1);
                } else {
                    await mouse.scrollDown(1);
                }
            }
            return { content: [{ type: 'text', text: `Scrolled ${args.direction} ${amount}x at (${args.x}, ${args.y})` }] };
        }

        if (name === 'get_cursor_position') {
            const pos = await mouse.getPosition();
            return { content: [{ type: 'text', text: `Cursor position: x=${pos.x}, y=${pos.y}` }] };
        }

        throw new Error(`Unknown tool: ${name}`);

    } catch (err) {
        return {
            content: [{ type: 'text', text: `Error: ${err.message}` }],
            isError: true
        };
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('LetterBlack Computer Use MCP server running on stdio');
}

main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
