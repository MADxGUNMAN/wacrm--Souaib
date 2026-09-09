/**
 * The simulator's only job is to be believable.
 *
 * If it disagrees with the engine, the playground tells a user their
 * flow works and the customer's real conversation dead-ends — a failure
 * that is invisible precisely because both sides look fine on their own.
 * So these tests pin the behaviour that has to match production:
 * trigger matching, which node types wait, where a branch goes, what
 * gets captured into vars, and the fallback ladder.
 */

import { describe, it, expect } from 'vitest';
import {
  startSimulation,
  stepSimulation,
  tagIdsReferencedBy,
  triggerHint,
  optionsForNode,
  SIM_STEP_CAP,
  EMPTY_SIM_CONTACT,
  type SimEvent,
  type SimFlow,
  type SimNode,
  type SimState,
} from './simulate';

// ------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------

const keywordFlow: SimFlow = {
  name: 'Bulk enquiry',
  trigger_type: 'keyword',
  trigger_config: { keywords: ['bulk price'], match_type: 'contains' },
  entry_node_id: 'start',
  fallback_policy: {},
};

/** start → buttons(qty) → collect(name) → summary → handoff */
const happyNodes: SimNode[] = [
  {
    node_key: 'start',
    node_type: 'start',
    config: { next_node_key: 'ask_qty' },
  },
  {
    node_key: 'ask_qty',
    node_type: 'send_buttons',
    config: {
      text: 'How many units?',
      var_key: 'quantity',
      buttons: [
        { reply_id: 'small', title: '1-5 units', next_node_key: 'ask_name' },
        { reply_id: 'bulk', title: '25+ units', next_node_key: 'tag_bulk' },
      ],
    },
  },
  {
    node_key: 'tag_bulk',
    node_type: 'set_tag',
    config: { mode: 'add', tag_id: 'tag-bulk', next_node_key: 'ask_name' },
  },
  {
    node_key: 'ask_name',
    node_type: 'collect_input',
    config: {
      prompt_text: 'Your name?',
      var_key: 'name',
      next_node_key: 'summary',
    },
  },
  {
    node_key: 'summary',
    node_type: 'send_message',
    config: {
      text: 'Thanks {{vars.name}} — {{vars.quantity}} noted.',
      next_node_key: 'to_agent',
    },
  },
  {
    node_key: 'to_agent',
    node_type: 'handoff',
    config: { note: 'Lead: {{vars.name}} wants {{vars.quantity}}' },
  },
];

function kinds(events: SimEvent[]): string[] {
  return events.map((e) => e.kind);
}

function texts(events: SimEvent[]): string[] {
  return events
    .filter(
      (e): e is Extract<SimEvent, { kind: 'bot_text' }> => e.kind === 'bot_text'
    )
    .map((e) => e.text);
}

function fire(
  state: SimState,
  text: string,
  nodes = happyNodes,
  flow = keywordFlow
) {
  return stepSimulation(state, { kind: 'text', text }, flow, nodes);
}

// ------------------------------------------------------------
// Trigger
// ------------------------------------------------------------

describe('trigger', () => {
  it('parks before the trigger rather than auto-starting', () => {
    const s = startSimulation({ flow: keywordFlow, nodes: happyNodes });
    expect(s.status).toBe('awaiting_trigger');
    expect(s.currentNodeKey).toBeNull();
    expect(s.events).toEqual([]);
  });

  it('does not start when no keyword matches, and says why', () => {
    let s = startSimulation({ flow: keywordFlow, nodes: happyNodes });
    s = fire(s, 'hello there');
    expect(s.status).toBe('awaiting_trigger');
    expect(kinds(s.events)).toContain('note');
    expect(s.visited).toEqual([]);
  });

  it('starts on a keyword match and runs to the first waiting step', () => {
    let s = startSimulation({ flow: keywordFlow, nodes: happyNodes });
    s = fire(s, 'what is your BULK PRICE?');
    expect(s.status).toBe('awaiting_reply');
    expect(s.currentNodeKey).toBe('ask_qty');
    expect(s.awaiting).toEqual({
      type: 'tap',
      nodeKey: 'ask_qty',
      options: [
        { reply_id: 'small', title: '1-5 units' },
        { reply_id: 'bulk', title: '25+ units' },
      ],
    });
    // start is passed through, not skipped.
    expect(s.visited).toEqual(['start', 'ask_qty']);
  });

  it('first_inbound_message and manual start on anything', () => {
    for (const trigger_type of ['first_inbound_message', 'manual'] as const) {
      const flow: SimFlow = {
        ...keywordFlow,
        trigger_type,
        trigger_config: {},
      };
      let s = startSimulation({ flow, nodes: happyNodes });
      s = stepSimulation(s, { kind: 'text', text: 'yo' }, flow, happyNodes);
      expect(s.currentNodeKey).toBe('ask_qty');
    }
  });

  it('explains a keyword trigger with no keywords instead of matching nothing', () => {
    const flow: SimFlow = { ...keywordFlow, trigger_config: { keywords: [] } };
    expect(triggerHint(flow)).toMatch(/no keywords/i);
  });

  it('reports a missing entry step up front', () => {
    const s = startSimulation({
      flow: { ...keywordFlow, entry_node_id: null },
      nodes: happyNodes,
    });
    expect(kinds(s.events)).toContain('problem');
  });

  it('reports an entry step that is not in the flow', () => {
    const s = startSimulation({
      flow: { ...keywordFlow, entry_node_id: 'ghost' },
      nodes: happyNodes,
    });
    expect(kinds(s.events)).toContain('problem');
  });
});

// ------------------------------------------------------------
// End-to-end happy path
// ------------------------------------------------------------

describe('end to end', () => {
  it('captures a tapped title, a typed answer, and interpolates both', () => {
    let s = startSimulation({ flow: keywordFlow, nodes: happyNodes });
    s = fire(s, 'bulk price');
    s = stepSimulation(
      s,
      { kind: 'tap', reply_id: 'bulk', title: '25+ units' },
      keywordFlow,
      happyNodes
    );
    // Tapping "bulk" routes via set_tag, which must apply the tag.
    expect(s.contact.tagIds).toContain('tag-bulk');
    expect(s.vars.quantity).toBe('25+ units');
    expect(s.currentNodeKey).toBe('ask_name');

    s = fire(s, 'Souaib Ansari');
    expect(s.vars.name).toBe('Souaib Ansari');
    expect(s.status).toBe('ended');
    expect(s.endStatus).toBe('handed_off');
    expect(texts(s.events)).toContain(
      'Thanks Souaib Ansari — 25+ units noted.'
    );

    const handoff = s.events.find(
      (e): e is Extract<SimEvent, { kind: 'handoff' }> => e.kind === 'handoff'
    );
    expect(handoff?.note).toBe('Lead: Souaib Ansari wants 25+ units');
    // `name` is one of the auto-filled contact columns.
    expect(handoff?.contactUpdates).toEqual({ name: 'Souaib Ansari' });
  });

  it('stores the tapped TITLE, not the reply_id', () => {
    let s = startSimulation({ flow: keywordFlow, nodes: happyNodes });
    s = fire(s, 'bulk price');
    s = stepSimulation(
      s,
      { kind: 'tap', reply_id: 'small', title: '1-5 units' },
      keywordFlow,
      happyNodes
    );
    expect(s.vars.quantity).toBe('1-5 units');
    expect(s.vars.quantity).not.toBe('small');
  });

  it('seeded vars are usable immediately and are called out', () => {
    let s = startSimulation({
      flow: keywordFlow,
      nodes: happyNodes,
      seedVars: { name: 'Pre Set' },
    });
    expect(kinds(s.events)).toContain('note');
    s = fire(s, 'bulk price');
    s = stepSimulation(
      s,
      { kind: 'tap', reply_id: 'small', title: '1-5 units' },
      keywordFlow,
      happyNodes
    );
    s = fire(s, 'Real Name');
    // collect_input overwrites the seed.
    expect(s.vars.name).toBe('Real Name');
  });

  it('warns when a question captures nothing', () => {
    const nodes: SimNode[] = [
      { node_key: 'start', node_type: 'start', config: { next_node_key: 'q' } },
      {
        node_key: 'q',
        node_type: 'send_buttons',
        config: {
          text: 'Pick',
          buttons: [{ reply_id: 'a', title: 'A', next_node_key: 'done' }],
        },
      },
      { node_key: 'done', node_type: 'end', config: {} },
    ];
    let s = startSimulation({ flow: keywordFlow, nodes });
    s = fire(s, 'bulk price', nodes);
    s = stepSimulation(
      s,
      { kind: 'tap', reply_id: 'a', title: 'A' },
      keywordFlow,
      nodes
    );
    expect(
      s.events.some(
        (e) => e.kind === 'note' && /no variable set/i.test(e.message)
      )
    ).toBe(true);
    expect(s.endStatus).toBe('completed');
  });
});

// ------------------------------------------------------------
// Conditions
// ------------------------------------------------------------

describe('condition', () => {
  const condNodes: SimNode[] = [
    {
      node_key: 'start',
      node_type: 'start',
      config: { next_node_key: 'check' },
    },
    {
      node_key: 'check',
      node_type: 'condition',
      config: {
        subject: 'var',
        subject_key: 'quantity',
        operator: 'contains',
        value: '25+',
        true_next: 'yes',
        false_next: 'no',
      },
    },
    { node_key: 'yes', node_type: 'end', config: {} },
    { node_key: 'no', node_type: 'end', config: {} },
  ];

  it('branches true on a matching seeded var', () => {
    let s = startSimulation({
      flow: keywordFlow,
      nodes: condNodes,
      seedVars: { quantity: '25+ units' },
    });
    s = fire(s, 'bulk price', condNodes);
    expect(s.visited).toContain('yes');
    expect(s.visited).not.toContain('no');
  });

  it('branches false when the var is absent', () => {
    let s = startSimulation({ flow: keywordFlow, nodes: condNodes });
    s = fire(s, 'bulk price', condNodes);
    expect(s.visited).toContain('no');
  });

  it('reads the pretend contact for contact_field subjects', () => {
    const nodes: SimNode[] = [
      { node_key: 'start', node_type: 'start', config: { next_node_key: 'c' } },
      {
        node_key: 'c',
        node_type: 'condition',
        config: {
          subject: 'contact_field',
          subject_key: 'email',
          operator: 'present',
          true_next: 'yes',
          false_next: 'no',
        },
      },
      { node_key: 'yes', node_type: 'end', config: {} },
      { node_key: 'no', node_type: 'end', config: {} },
    ];
    let withEmail = startSimulation({
      flow: keywordFlow,
      nodes,
      contact: { ...EMPTY_SIM_CONTACT, email: 'a@b.com' },
    });
    withEmail = fire(withEmail, 'bulk price', nodes);
    expect(withEmail.visited).toContain('yes');

    let without = startSimulation({ flow: keywordFlow, nodes });
    without = fire(without, 'bulk price', nodes);
    expect(without.visited).toContain('no');
  });

  it('reads simulated tags, including one applied earlier in the same run', () => {
    const nodes: SimNode[] = [
      {
        node_key: 'start',
        node_type: 'start',
        config: { next_node_key: 'tag' },
      },
      {
        node_key: 'tag',
        node_type: 'set_tag',
        config: { mode: 'add', tag_id: 't1', next_node_key: 'c' },
      },
      {
        node_key: 'c',
        node_type: 'condition',
        config: {
          subject: 'tag',
          subject_key: 't1',
          operator: 'present',
          true_next: 'yes',
          false_next: 'no',
        },
      },
      { node_key: 'yes', node_type: 'end', config: {} },
      { node_key: 'no', node_type: 'end', config: {} },
    ];
    let s = startSimulation({ flow: keywordFlow, nodes });
    s = fire(s, 'bulk price', nodes);
    expect(s.visited).toContain('yes');
  });

  it('fails the run on an unknown contact_field, as production does', () => {
    const nodes: SimNode[] = [
      { node_key: 'start', node_type: 'start', config: { next_node_key: 'c' } },
      {
        node_key: 'c',
        node_type: 'condition',
        config: {
          subject: 'contact_field',
          subject_key: 'favourite_colour',
          operator: 'present',
          true_next: 'yes',
          false_next: 'no',
        },
      },
      { node_key: 'yes', node_type: 'end', config: {} },
      { node_key: 'no', node_type: 'end', config: {} },
    ];
    let s = startSimulation({ flow: keywordFlow, nodes });
    s = fire(s, 'bulk price', nodes);
    expect(s.endStatus).toBe('failed');
    expect(s.endReason).toBe('condition_evaluation_failed');
  });
});

// ------------------------------------------------------------
// Fallback ladder
// ------------------------------------------------------------

describe('fallback', () => {
  it('reprompts up to max_reprompts, then hands off', () => {
    const flow: SimFlow = {
      ...keywordFlow,
      fallback_policy: {
        on_unknown_reply: 'reprompt',
        max_reprompts: 2,
        on_timeout_hours: 24,
        on_exhaust: 'handoff',
      },
    };
    let s = startSimulation({ flow, nodes: happyNodes });
    s = stepSimulation(
      s,
      { kind: 'text', text: 'bulk price' },
      flow,
      happyNodes
    );
    expect(s.currentNodeKey).toBe('ask_qty');

    // Typing at a tap-only step never matches.
    s = stepSimulation(s, { kind: 'text', text: 'no idea' }, flow, happyNodes);
    expect(s.repromptCount).toBe(1);
    expect(s.status).toBe('awaiting_reply');

    s = stepSimulation(s, { kind: 'text', text: 'still no' }, flow, happyNodes);
    expect(s.repromptCount).toBe(2);
    expect(s.status).toBe('awaiting_reply');

    s = stepSimulation(s, { kind: 'text', text: 'nope' }, flow, happyNodes);
    expect(s.status).toBe('ended');
    expect(s.endStatus).toBe('handed_off');
    expect(s.endReason).toBe('fallback_exhausted');
  });

  it('on_unknown_reply=handoff escalates on the first miss', () => {
    const flow: SimFlow = {
      ...keywordFlow,
      fallback_policy: { on_unknown_reply: 'handoff' },
    };
    let s = startSimulation({ flow, nodes: happyNodes });
    s = stepSimulation(
      s,
      { kind: 'text', text: 'bulk price' },
      flow,
      happyNodes
    );
    s = stepSimulation(s, { kind: 'text', text: 'huh' }, flow, happyNodes);
    expect(s.endStatus).toBe('handed_off');
  });

  it('on_unknown_reply=ignore keeps waiting on the same step', () => {
    const flow: SimFlow = {
      ...keywordFlow,
      fallback_policy: { on_unknown_reply: 'ignore' },
    };
    let s = startSimulation({ flow, nodes: happyNodes });
    s = stepSimulation(
      s,
      { kind: 'text', text: 'bulk price' },
      flow,
      happyNodes
    );
    s = stepSimulation(s, { kind: 'text', text: 'huh' }, flow, happyNodes);
    expect(s.status).toBe('awaiting_reply');
    expect(s.currentNodeKey).toBe('ask_qty');
  });

  it('on_exhaust=end completes instead of handing off', () => {
    const flow: SimFlow = {
      ...keywordFlow,
      fallback_policy: { max_reprompts: 0, on_exhaust: 'end' },
    };
    let s = startSimulation({ flow, nodes: happyNodes });
    s = stepSimulation(
      s,
      { kind: 'text', text: 'bulk price' },
      flow,
      happyNodes
    );
    s = stepSimulation(s, { kind: 'text', text: 'huh' }, flow, happyNodes);
    expect(s.endStatus).toBe('completed');
    expect(s.endReason).toBe('fallback_exhausted_end');
  });

  it('an unrecognised tap id falls through to fallback', () => {
    let s = startSimulation({ flow: keywordFlow, nodes: happyNodes });
    s = fire(s, 'bulk price');
    s = stepSimulation(
      s,
      { kind: 'tap', reply_id: 'ghost', title: 'Ghost' },
      keywordFlow,
      happyNodes
    );
    expect(s.repromptCount).toBe(1);
    expect(s.vars.quantity).toBeUndefined();
  });

  it('a successful match resets the reprompt count', () => {
    let s = startSimulation({ flow: keywordFlow, nodes: happyNodes });
    s = fire(s, 'bulk price');
    s = fire(s, 'wrong');
    expect(s.repromptCount).toBe(1);
    s = stepSimulation(
      s,
      { kind: 'tap', reply_id: 'small', title: '1-5 units' },
      keywordFlow,
      happyNodes
    );
    expect(s.repromptCount).toBe(0);
  });
});

// ------------------------------------------------------------
// AI agent
// ------------------------------------------------------------

describe('ai_agent', () => {
  const aiNodes: SimNode[] = [
    { node_key: 'start', node_type: 'start', config: { next_node_key: 'ai' } },
    {
      node_key: 'ai',
      node_type: 'ai_agent',
      config: {
        prompt_text: 'Ask me anything',
        system_prompt: 'Be helpful',
        next_node_key: 'done',
      },
    },
    { node_key: 'done', node_type: 'end', config: {} },
  ];

  it('waits for the tester to stand in for the model', () => {
    let s = startSimulation({ flow: keywordFlow, nodes: aiNodes });
    s = fire(s, 'bulk price', aiNodes);
    expect(s.awaiting).toEqual({ type: 'ai_turn', nodeKey: 'ai' });
    // And it says outright that it cannot predict the model.
    expect(
      s.events.some(
        (e) => e.kind === 'note' && /AI assistant takes over/i.test(e.message)
      )
    ).toBe(true);
  });

  it('ai_continue stays on the node', () => {
    let s = startSimulation({ flow: keywordFlow, nodes: aiNodes });
    s = fire(s, 'bulk price', aiNodes);
    s = stepSimulation(
      s,
      { kind: 'ai_continue', reply: 'sure thing' },
      keywordFlow,
      aiNodes
    );
    expect(s.currentNodeKey).toBe('ai');
    expect(s.status).toBe('awaiting_reply');
  });

  it('ai_handoff advances to next_node_key', () => {
    let s = startSimulation({ flow: keywordFlow, nodes: aiNodes });
    s = fire(s, 'bulk price', aiNodes);
    s = stepSimulation(s, { kind: 'ai_handoff' }, keywordFlow, aiNodes);
    expect(s.endStatus).toBe('completed');
    expect(s.visited).toContain('done');
  });
});

// ------------------------------------------------------------
// Broken flows — the playground has to surface these, not hide them
// ------------------------------------------------------------

describe('broken flows', () => {
  it('reports a link that points at nothing', () => {
    const nodes: SimNode[] = [
      {
        node_key: 'start',
        node_type: 'start',
        config: { next_node_key: 'nowhere' },
      },
    ];
    let s = startSimulation({ flow: keywordFlow, nodes });
    s = fire(s, 'bulk price', nodes);
    expect(s.endStatus).toBe('failed');
    expect(s.endReason).toBe('node_not_found');
    expect(kinds(s.events)).toContain('problem');
  });

  it('reports an empty onward link', () => {
    const nodes: SimNode[] = [
      { node_key: 'start', node_type: 'start', config: { next_node_key: '' } },
    ];
    let s = startSimulation({ flow: keywordFlow, nodes });
    s = fire(s, 'bulk price', nodes);
    expect(s.endReason).toBe('missing_next_node');
  });

  it('reports an unknown node type', () => {
    const nodes: SimNode[] = [
      { node_key: 'start', node_type: 'start', config: { next_node_key: 'x' } },
      { node_key: 'x', node_type: 'delay', config: {} },
    ];
    let s = startSimulation({ flow: keywordFlow, nodes });
    s = fire(s, 'bulk price', nodes);
    expect(s.endReason).toBe('unknown_node_type');
  });

  it('stops a runaway loop at the same cap production uses', () => {
    const nodes: SimNode[] = [
      { node_key: 'start', node_type: 'start', config: { next_node_key: 'a' } },
      {
        node_key: 'a',
        node_type: 'send_message',
        config: { text: 'hi', next_node_key: 'a' },
      },
    ];
    let s = startSimulation({ flow: keywordFlow, nodes });
    s = fire(s, 'bulk price', nodes);
    expect(s.endReason).toBe('advance_loop_overflow');
    expect(s.visited.length).toBe(SIM_STEP_CAP);
  });

  it('flags a send_media step with no file', () => {
    const nodes: SimNode[] = [
      { node_key: 'start', node_type: 'start', config: { next_node_key: 'm' } },
      {
        node_key: 'm',
        node_type: 'send_media',
        config: { media_type: 'image', media_url: '', next_node_key: 'e' },
      },
      { node_key: 'e', node_type: 'end', config: {} },
    ];
    let s = startSimulation({ flow: keywordFlow, nodes });
    s = fire(s, 'bulk price', nodes);
    expect(
      s.events.some(
        (e) => e.kind === 'problem' && /No file is attached/i.test(e.message)
      )
    ).toBe(true);
  });

  it('flags a set_tag step with no tag chosen', () => {
    const nodes: SimNode[] = [
      { node_key: 'start', node_type: 'start', config: { next_node_key: 't' } },
      {
        node_key: 't',
        node_type: 'set_tag',
        config: { mode: 'add', tag_id: '', next_node_key: 'e' },
      },
      { node_key: 'e', node_type: 'end', config: {} },
    ];
    let s = startSimulation({ flow: keywordFlow, nodes });
    s = fire(s, 'bulk price', nodes);
    expect(kinds(s.events)).toContain('problem');
  });
});

// ------------------------------------------------------------
// Immutability + small helpers
// ------------------------------------------------------------

describe('mechanics', () => {
  it('never mutates the state handed to it', () => {
    const before = startSimulation({ flow: keywordFlow, nodes: happyNodes });
    const snapshot = JSON.stringify(before);
    fire(before, 'bulk price');
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('ignores input once the run has ended', () => {
    let s = startSimulation({ flow: keywordFlow, nodes: happyNodes });
    s = fire(s, 'bulk price');
    s = stepSimulation(
      s,
      { kind: 'tap', reply_id: 'small', title: '1-5 units' },
      keywordFlow,
      happyNodes
    );
    s = fire(s, 'Name');
    expect(s.status).toBe('ended');
    const after = fire(s, 'anything else');
    expect(after).toBe(s);
  });

  it('collects every tag id the flow reads or writes', () => {
    expect(tagIdsReferencedBy(happyNodes)).toEqual(['tag-bulk']);
  });

  it('enumerates list rows across sections as tap options', () => {
    const node: SimNode = {
      node_key: 'l',
      node_type: 'send_list',
      config: {
        text: 'x',
        button_label: 'Pick',
        sections: [
          {
            title: 'A',
            rows: [{ reply_id: 'r1', title: 'One', next_node_key: 'e' }],
          },
          {
            title: 'B',
            rows: [{ reply_id: 'r2', title: 'Two', next_node_key: 'e' }],
          },
        ],
      },
    };
    expect(optionsForNode(node)).toEqual([
      { reply_id: 'r1', title: 'One' },
      { reply_id: 'r2', title: 'Two' },
    ]);
  });
});
