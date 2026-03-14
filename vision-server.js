#!/usr/bin/env node

/**
 * MCP Gemini Vision Server - LetterBlack
 * Screenshots analyzed by Gemini Flash (free tier)
 * Zero Claude tokens burned on vision
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import screenshot from 'screenshot-desktop';
import { mouse, keyboard, Point, Button, Key } from '@nut-tree-fork/nut-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });

mouse.config.mouseSpeed = 1500;
keyboard.config.autoDelayMs = 0;

const server = new Server(
    { name: 'letterblack-vision', version: '1.0.0' },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'see_screen',
            description: 'Take a screenshot and analyze it with Gemini Flash. Ask any question about what is on screen.',
            inputSchema: {
                type: 'object',
                properties: {
                    question: {
                        type: 'string',
                        description: 'What do you want to know about the screen? e.g. "What windows are open?", "Where is the Save button?", "What error is showing?"'
                    }
                },
                required: ['question']
            }
        },
        {
            name: 'mouse_click',
            description: 'Move mouse and click at x,y coordinates',
            inputSchema: {
                type: 'object',
                properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    button: { type: 'string', enum: ['left', 'right', 'middle'] },
                    double: { type: 'boolean' }
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
                    text: { type: 'string' }
                },
                required: ['text']
            }
        },
        {
            name: 'key_press',
            description: 'Press a key or combo like Enter, Escape, Control+C, Control+V, Alt+F4',
            inputSchema: {
                type: 'object',
                properties: {
                    key: { type: 'string' }
                },
                required: ['key']
            }
        },
        {
            name: 'scroll',
            description: 'Scroll up or down at x,y position',
            inputSchema: {
                type: 'object',
                properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    direction: { type: 'string', enum: ['up', 'down'] },
                    amount: { type: 'number' }
                },
                required: ['x', 'y', 'direction']
            }
        }
    ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        if (name === 'see_screen') {
            const buf = await screenshot();
            const pos = await mouse.getPosition();
            const base64 = buf.toString('base64');

            const prompt = args.question || 'Describe everything you see on this screen in detail. List all open windows, what is in focus, and any important UI elements.';

            const result = await model.generateContent([
                `You are a screen analysis assistant. Cursor is at x=${pos.x}, y=${pos.y}. ${prompt}`,
                { inlineData: { data: base64, mimeType: 'image/png' } }
            ]);

            const text = result.response.text();
            return {
                content: [{
                    type: 'text',
                    text: `[Gemini Flash Analysis — cursor at ${pos.x},${pos.y}]\n\n${text}`
                }]
            };
        }

        if (name === 'mouse_click') {
            await mouse.move([new Point(args.x, args.y)]);
            const btn = args.button === 'right' ? Button.RIGHT : args.button === 'middle' ? Button.MIDDLE : Button.LEFT;
            if (args.double) {
                await mouse.doubleClick(btn);
            } else {
                await mouse.click(btn);
            }
            return { content: [{ type: 'text', text: `${args.double ? 'Double-clicked' : 'Clicked'} at (${args.x}, ${args.y})` }] };
        }

        if (name === 'type_text') {
            await keyboard.type(args.text);
            return { content: [{ type: 'text', text: `Typed: "${args.text}"` }] };
        }

        if (name === 'key_press') {
            const keyStr = args.key;
            if (keyStr.includes('+')) {
                const parts = keyStr.split('+');
                const mods = parts.slice(0, -1).map(k => Key[k] || Key[k.toUpperCase()]).filter(Boolean);
                const mainKey = Key[parts[parts.length - 1]] || Key[parts[parts.length - 1].toUpperCase()];
                await keyboard.pressKey(...mods, mainKey);
                await keyboard.releaseKey(...mods, mainKey);
            } else {
                const k = Key[keyStr] || Key[keyStr.toUpperCase()];
                await keyboard.pressKey(k);
                await keyboard.releaseKey(k);
            }
            return { content: [{ type: 'text', text: `Pressed: ${keyStr}` }] };
        }

        if (name === 'scroll') {
            await mouse.move([new Point(args.x, args.y)]);
            const amount = args.amount || 3;
            for (let i = 0; i < amount; i++) {
                if (args.direction === 'up') await mouse.scrollUp(1);
                else await mouse.scrollDown(1);
            }
            return { content: [{ type: 'text', text: `Scrolled ${args.direction} ${amount}x at (${args.x}, ${args.y})` }] };
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
    console.error('LetterBlack Vision MCP (Gemini Flash) running on stdio');
}

main().catch(err => {
    console.error('Server error:', err);
    process.exit(1);
});
