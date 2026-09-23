import { describe, expect, it } from 'vitest';
import {
  MAX_FOLLOW_UP_TURNS,
  buildCoachMessages,
  isOpeningTurn,
  threadTitle,
  type CoachTurn,
} from './coach-thread';

const base = { system: 'SYS', opening: 'OPENING+CONTEXT' };
const turn = (role: CoachTurn['role'], content: string): CoachTurn => ({ role, content });

describe('what the provider actually receives', () => {
  it('carries the previous turns, which is the whole point', () => {
    const msgs = buildCoachMessages({
      ...base,
      turns: [turn('assistant', 'Bench looks stalled.'), turn('user', 'Why?')],
    });
    expect(msgs.map((m) => m.content)).toEqual([
      'SYS',
      'OPENING+CONTEXT',
      'Bench looks stalled.',
      'Why?',
    ]);
  });

  it('sends the local context exactly once, not on every turn', () => {
    const msgs = buildCoachMessages({
      ...base,
      turns: [turn('assistant', 'a'), turn('user', 'b'), turn('assistant', 'c')],
    });
    expect(msgs.filter((m) => m.content.includes('OPENING+CONTEXT'))).toHaveLength(1);
  });

  it('starts with the system prompt and the opening, in that order', () => {
    const msgs = buildCoachMessages({ ...base, turns: [] });
    expect(msgs).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'OPENING+CONTEXT' },
    ]);
  });

  it('keeps the most recent turns when the thread runs long', () => {
    const turns = Array.from({ length: 30 }, (_, i) =>
      turn(i % 2 === 0 ? 'user' : 'assistant', `m${i}`)
    );
    const msgs = buildCoachMessages({ ...base, turns, maxTurns: 4 });
    expect(msgs.slice(2).map((m) => m.content)).toEqual(['m26', 'm27', 'm28', 'm29']);
  });

  it('never drops the opening, however long the thread gets', () => {
    const turns = Array.from({ length: 50 }, (_, i) => turn('user', `m${i}`));
    const msgs = buildCoachMessages({ ...base, turns, maxTurns: 2 });
    expect(msgs[1].content).toBe('OPENING+CONTEXT');
  });

  it('does not open the kept history with a reply whose question was trimmed', () => {
    const turns = [turn('user', 'q1'), turn('assistant', 'a1'), turn('user', 'q2')];
    const msgs = buildCoachMessages({ ...base, turns, maxTurns: 2 });
    // maxTurns 2 would keep [a1, q2]; a1 answers a question no longer present.
    expect(msgs.slice(2).map((m) => m.content)).toEqual(['q2']);
  });

  it('drops blank turns rather than sending empty messages', () => {
    const msgs = buildCoachMessages({
      ...base,
      turns: [turn('user', '   '), turn('assistant', 'real'), turn('user', '')],
    });
    // A blank turn is noise that was never a message, not history trimmed for
    // length — so the real reply still belongs to the opening and stays.
    expect(msgs.map((m) => m.content)).toEqual(['SYS', 'OPENING+CONTEXT', 'real']);
  });

  it('ships a cap that leaves room for a real back-and-forth', () => {
    expect(MAX_FOLLOW_UP_TURNS).toBeGreaterThanOrEqual(6);
  });
});

describe('deciding whether a question opens the thread', () => {
  it('is the opening when nothing has been said', () => {
    expect(isOpeningTurn([])).toBe(true);
    expect(isOpeningTurn([turn('user', '  ')])).toBe(true);
  });

  it('is not the opening once there is a real turn', () => {
    expect(isOpeningTurn([turn('assistant', 'hello')])).toBe(false);
  });
});

describe('naming the thread', () => {
  it('uses the question', () => {
    expect(threadTitle('How do I fix my bench?', 'Ask')).toBe('How do I fix my bench?');
  });

  it('falls back when nothing was typed', () => {
    expect(threadTitle('   ', 'Weekly check-in')).toBe('Weekly check-in');
  });

  it('truncates a long question instead of storing an essay', () => {
    const t = threadTitle('x'.repeat(200), 'Ask');
    expect(t).toHaveLength(58);
    expect(t.endsWith('…')).toBe(true);
  });

  it('collapses newlines so the title stays one line', () => {
    expect(threadTitle('a\n\n  b', 'Ask')).toBe('a b');
  });
});
