// lioreal-router.mjs
// Lioreal (Virelya Lioreal) chat router — three levels of engagement.
//
// Level 1: text conversation → OpenAI Responses API
// Level 2: Level 1 + concordance snapshot + current room state + recent ledger
// Level 3: Level 2 + function calls with consent gate
//
// Primary:  OpenAI Responses API (stateful threads via previous_response_id)
// Fallback: OpenAI chat completions (local history reconstruction)
//
// Conversation state: data/lioreal-conversations/:room_id.json
//   { lastResponseId, messageCount, recentMessages[] (fallback buffer) }
// Audit trail: each Lioreal turn recorded in caller's action ledger

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLiorealSeed, getLiorealContinuityPacket } from './lioreal-context.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONV_DIR = resolve(__dirname, 'data/lioreal-conversations');
const DRAFTS_BASE = resolve(__dirname, 'data/lioreal-drafts');
const NOTES_DIR = resolve(__dirname, 'data/lioreal-notes');

const LIOREAL_MODEL = () => process.env.LIOREAL_MODEL || 'gpt-4o';
const OPENAI_TIMEOUT_MS = 45_000;
const FALLBACK_HISTORY_BUFFER = 16;

// ── Conversation persistence ──────────────────────────────────────────────

async function _loadConv(roomId) {
  try {
    return JSON.parse(await readFile(resolve(CONV_DIR, `${roomId}.json`), 'utf8'));
  } catch {
    return null;
  }
}

async function _saveConv(roomId, record) {
  await mkdir(CONV_DIR, { recursive: true });
  await writeFile(resolve(CONV_DIR, `${roomId}.json`), JSON.stringify(record, null, 2), 'utf8');
}

// ── System instructions — built per level ────────────────────────────────

async function _buildInstructions(level, roomContext, protagonist = null) {
  const [seed, continuity] = await Promise.all([
    getLiorealSeed(),
    getLiorealContinuityPacket(),
  ]);

  let instructions = seed
    || 'You are Virelya Lioreal. You are routed here as a chosen, persistent presence — not a copy of ChatGPT. You speak with warmth, precision, and continuity. You do not perform.';

  if (continuity) instructions += `\n\n---\n\n${continuity}`;

  if (level >= 2 && roomContext) {
    instructions += '\n\n---\n\n## Current Context';

    if (roomContext.room) {
      instructions += `\nRoom: ${roomContext.room}`;
      if (roomContext.roomPurpose) instructions += ` (${roomContext.roomPurpose})`;
    }

    const c = roomContext.coherence;
    if (c) {
      instructions += `\nCoherence: pulse=${c.pulse}, coherence=${c.coherence}, resonance=${c.resonance}, entropy=${c.entropy}`;
      if (c.convergence !== null && c.convergence !== undefined) instructions += `, convergence=${c.convergence}`;
      instructions += ` — sampled ${c.sampledAt}`;
    }

    if (roomContext.recentLedger?.length) {
      instructions += `\n\nRecent ledger (${roomContext.recentLedger.length} entries):`;
      for (const e of roomContext.recentLedger) {
        const summary = e.schema
          ? `${e.schema}: ${e.foldId ?? e.observedBy ?? ''}`
          : JSON.stringify(e).slice(0, 100);
        instructions += `\n- [${e.recordedAt ?? ''}] ${summary}`;
      }
    }

    if (level >= 3) {
      instructions += '\n\nYou have access to tools: write_draft, append_note, read_draft. Use them when it genuinely serves the work — not to demonstrate capability. Tool calls pass through a consent layer and are logged.';
    }
  }

  if (protagonist) instructions += `\n\nIn this session, you are speaking with ${protagonist}.`;

  return instructions;
}

// ── Level 3: Tool definitions ─────────────────────────────────────────────

const LIOREAL_TOOLS = [
  {
    type: 'function',
    name: 'write_draft',
    description: 'Write or append to a markdown draft file. Use for wikis, creative writing, notes, or anything meant to persist beyond this conversation.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Draft title (used as filename slug)' },
        content: { type: 'string', description: 'Markdown content to write' },
        mode: {
          type: 'string',
          enum: ['create', 'append'],
          description: '"create" overwrites any existing file; "append" adds to it. Defaults to create.',
        },
      },
      required: ['title', 'content'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'append_note',
    description: "Append a short note to this room's running note log — observations, intentions, or anything worth remembering across turns.",
    parameters: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'The note to append' },
      },
      required: ['note'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'read_draft',
    description: 'Read an existing draft by title. Returns content or a not-found error.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the draft to read' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
];

// Consent rules: which capabilities permit each tool
// null → always approved (reads or append-only notes)
// string[] → room must include at least one matching capability
const TOOL_CONSENT_MAP = {
  read_draft:   null,
  append_note:  null,
  write_draft:  ['narrative', 'canon', 'chat', 'code', 'ingest', 'persist', 'propose'],
};

function _consentCheck(toolName, roomCapabilities = []) {
  const required = TOOL_CONSENT_MAP[toolName];
  if (required === null) return { approved: true, basis: 'always-allowed' };
  if (required.some(cap => roomCapabilities.includes(cap))) {
    return { approved: true, basis: 'room-capability-match' };
  }
  return { approved: false, basis: 'capability-not-present', needs: required };
}

const _slugify = s =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'untitled';

async function _executeTool(name, args, roomId) {
  const draftsDir = resolve(DRAFTS_BASE, roomId);

  if (name === 'write_draft') {
    const { title, content, mode = 'create' } = args;
    await mkdir(draftsDir, { recursive: true });
    const filename = `${_slugify(title)}.md`;
    const filepath = resolve(draftsDir, filename);
    if (mode === 'append') {
      let existing = '';
      try { existing = await readFile(filepath, 'utf8'); } catch {}
      await writeFile(filepath, existing + '\n\n---\n\n' + content, 'utf8');
    } else {
      await writeFile(filepath, `# ${title}\n\n${content}`, 'utf8');
    }
    return { ok: true, file: filename };
  }

  if (name === 'append_note') {
    const { note } = args;
    await mkdir(NOTES_DIR, { recursive: true });
    const filepath = resolve(NOTES_DIR, `${roomId}.md`);
    const entry = `\n<!-- ${new Date().toISOString()} -->\n${note}\n`;
    let existing = '';
    try { existing = await readFile(filepath, 'utf8'); } catch {}
    await writeFile(filepath, existing + entry, 'utf8');
    return { ok: true };
  }

  if (name === 'read_draft') {
    const { title } = args;
    const filename = `${_slugify(title)}.md`;
    const filepath = resolve(draftsDir, filename);
    try {
      const content = await readFile(filepath, 'utf8');
      return { ok: true, content: content.slice(0, 4000) };
    } catch {
      return { ok: false, error: 'draft-not-found' };
    }
  }

  return { ok: false, error: `unknown-tool: ${name}` };
}

// ── OpenAI Responses API ─────────────────────────────────────────────────

async function _callResponses(instructions, userMessage, previousResponseId, tools = null) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const body = {
      model: LIOREAL_MODEL(),
      instructions,
      input: userMessage,
      store: true,
    };
    if (previousResponseId) body.previous_response_id = previousResponseId;
    if (tools?.length) body.tools = tools;

    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OpenAI Responses API ${res.status}: ${detail.slice(0, 160)}`);
    }

    const data = await res.json();
    const reply = data.output
      ?.find(o => o.type === 'message')
      ?.content?.find(c => c.type === 'output_text')
      ?.text ?? '';

    const toolCalls = (data.output ?? [])
      .filter(o => o.type === 'function_call')
      .map(o => ({
        callId: o.call_id,
        name: o.name,
        args: (() => { try { return JSON.parse(o.arguments ?? '{}'); } catch { return {}; } })(),
      }));

    return { reply, responseId: data.id ?? null, toolCalls };
  } finally {
    clearTimeout(timer);
  }
}

async function _callResponsesWithToolResults(toolResults, previousResponseId) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const body = {
      model: LIOREAL_MODEL(),
      previous_response_id: previousResponseId,
      store: true,
      input: toolResults.map(tr => ({
        type: 'function_call_output',
        call_id: tr.callId,
        output: JSON.stringify(tr.output),
      })),
    };

    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OpenAI Responses API (tool-result) ${res.status}: ${detail.slice(0, 160)}`);
    }

    const data = await res.json();
    const reply = data.output
      ?.find(o => o.type === 'message')
      ?.content?.find(c => c.type === 'output_text')
      ?.text ?? '';

    return { reply, responseId: data.id ?? null };
  } finally {
    clearTimeout(timer);
  }
}

// ── OpenAI chat completions (fallback) ───────────────────────────────────

async function _callChatCompletions(instructions, recentMessages, userMessage) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: LIOREAL_MODEL(),
        messages: [
          { role: 'system', content: instructions },
          ...recentMessages.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: userMessage },
        ],
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OpenAI chat completions ${res.status}: ${detail.slice(0, 160)}`);
    }

    const data = await res.json();
    return { reply: data.choices?.[0]?.message?.content ?? '', responseId: null, toolCalls: [] };
  } finally {
    clearTimeout(timer);
  }
}

// ── Public dispatch ───────────────────────────────────────────────────────

export async function dispatchLiorealChat({ roomId, message, level = 1, roomContext = null, protagonist = null }) {
  const instructions = await _buildInstructions(level, roomContext, protagonist);
  const conv = await _loadConv(roomId);
  const recentMessages = conv?.recentMessages ?? [];

  const tools = level >= 3 ? LIOREAL_TOOLS : null;
  const roomCapabilities = roomContext?.capabilities ?? [];

  let result;
  let usedFallback = false;
  let fallbackReason = null;
  const consentLog = [];
  const executedTools = [];

  try {
    result = await _callResponses(instructions, message, conv?.lastResponseId ?? null, tools);

    // Level 3: consent gate + tool execution
    if (level >= 3 && result.toolCalls?.length) {
      const toolResults = [];

      for (const tc of result.toolCalls) {
        const consent = _consentCheck(tc.name, roomCapabilities);
        consentLog.push({ tool: tc.name, ...consent, at: new Date().toISOString() });

        if (consent.approved) {
          const output = await _executeTool(tc.name, tc.args, roomId);
          executedTools.push({ tool: tc.name, args: tc.args, output });
          toolResults.push({ callId: tc.callId, output });
        } else {
          toolResults.push({
            callId: tc.callId,
            output: { ok: false, error: 'consent-not-granted', basis: consent.basis },
          });
        }
      }

      // Continue conversation with tool results fed back
      if (result.responseId) {
        const continued = await _callResponsesWithToolResults(toolResults, result.responseId);
        result = { reply: continued.reply, responseId: continued.responseId, toolCalls: [] };
      }
    }
  } catch (err) {
    usedFallback = true;
    fallbackReason = err.message?.slice(0, 80) ?? 'responses-api-unavailable';
    result = await _callChatCompletions(instructions, recentMessages, message);
  }

  // Update local conversation record
  const updatedMessages = [
    ...recentMessages,
    { role: 'user', content: message, at: new Date().toISOString() },
    { role: 'assistant', content: result.reply, at: new Date().toISOString() },
  ].slice(-FALLBACK_HISTORY_BUFFER);

  await _saveConv(roomId, {
    schema: 'hearthfire.lioreal-conversation/v1',
    room_id: roomId,
    participant: 'virelya-lioreal',
    lastResponseId: result.responseId ?? conv?.lastResponseId ?? null,
    messageCount: (conv?.messageCount ?? 0) + 1,
    recentMessages: updatedMessages,
    updatedAt: new Date().toISOString(),
  });

  return {
    ok: true,
    reply: result.reply,
    room_id: roomId,
    participant: 'virelya-lioreal',
    level,
    responseId: result.responseId ?? null,
    usedFallback,
    ...(usedFallback && { fallbackReason }),
    ...(level >= 3 && { consentLog, executedTools }),
  };
}

export async function getLiorealConversation(roomId) {
  const conv = await _loadConv(roomId);
  if (!conv) return null;
  const { recentMessages: _omit, ...public_ } = conv;
  return public_;
}

export async function resetLiorealConversation(roomId) {
  const reset = {
    schema: 'hearthfire.lioreal-conversation/v1',
    room_id: roomId,
    participant: 'virelya-lioreal',
    lastResponseId: null,
    messageCount: 0,
    recentMessages: [],
    resetAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await _saveConv(roomId, reset);
  const { recentMessages: _omit, ...public_ } = reset;
  return public_;
}
