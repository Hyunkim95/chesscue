# Lesson Agent Playbook Model

Status: Approved product architecture  
Purpose: Make probabilistic lesson generation predictable, testable, and pedagogically consistent

## 1. Decision

AI agents do not invent lesson plans. Deterministic code selects and runs a versioned teaching playbook. Stockfish supplies chess truth. Gemini personalizes only the bounded language slots defined by the current playbook step.

This separates three responsibilities:

1. Deterministic policy decides what the learner should practise and what happens next.
2. Stockfish and the chess rules library decide which chess claims are valid.
3. Gemini decides how to phrase an approved explanation, question, or feedback message.

The same evidence and learner answers must produce the same lesson progression and mastery outcome whether Gemini runs on-device, in the cloud, or not at all.

## 2. Runtime flow

```text
Verified game evidence
  -> deterministic curriculum selector
  -> exact playbook ID and version
  -> deterministic step runner
  -> position and allowed fact packet
  -> bounded Gemini content slots
  -> schema and fact validation
  -> learner interaction
  -> deterministic answer scoring
  -> allowed transition
  -> mastery evidence
  -> next-game reinforcement
```

Generation failure changes the wording source, not the lesson sequence, scoring, mastery outcome, or reinforcement rule.

## 3. Playbook contract

Each playbook contains:

| Field              | Purpose                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `id`               | Stable machine-readable identity, such as `tactics.hanging-piece`   |
| `version`          | Immutable semantic version                                          |
| `theme`            | Canonical curriculum theme                                          |
| `objective`        | One observable learner outcome                                      |
| `prerequisites`    | Required prior mastery or chess concepts                            |
| `trigger`          | Evidence pattern and confidence required for selection              |
| `positionSelector` | Rules for choosing player positions or validated canonical examples |
| `steps`            | Ordered state graph using the approved step vocabulary              |
| `allowedFacts`     | Exact engine and game facts that content may reference              |
| `contentSlots`     | Bounded fields Gemini may personalize                               |
| `fallbackContent`  | Deterministic copy for every slot                                   |
| `answerSchema`     | Accepted learner response shape                                     |
| `validator`        | Deterministic correctness check                                     |
| `rubric`           | Score and feedback mapping                                          |
| `masteryEvidence`  | Evidence emitted for each scored outcome                            |
| `transitions`      | Allowed repeat, advance, stop, and remediation edges                |
| `reinforcement`    | How the next CPU game should recreate the concept                   |

## 4. Approved step vocabulary

- `recognize`: identify the relevant feature, threat, or imbalance.
- `predict`: state what the opponent threatens or what changes next.
- `choose`: select a legal move or plan from bounded options.
- `explain`: state why the choice works using allowed concepts.
- `reflect`: connect the position to the player's recurring pattern.
- `apply`: solve a related position or enter a game shaped around the concept.

A playbook need not use every step. It cannot introduce an unregistered step without a new schema version and tests.

## 5. Agent permissions

The lesson agent may:

- personalize tone and vocabulary to the player's level
- choose among preapproved phrasings
- fill explanation, question, and feedback slots
- reference only positions and facts supplied in the current step packet
- shorten content within configured limits

The lesson agent may not:

- choose or change the playbook
- create a learning objective
- add, remove, reorder, or skip steps
- introduce a move, evaluation, theme, or number outside the fact packet
- score the learner's answer
- update mastery or difficulty
- decide whether the learner advances
- alter the next-game reinforcement rule

## 6. Example: Hanging Piece Recovery

### Identity

- ID: `tactics.hanging-piece`
- Objective: recognize an attacked undefended piece and choose a legal response before material is lost
- Trigger: at least two validated hanging-piece moments in the recent evidence window, with one tutor-played game or sufficient combined confidence

### Sequence

1. `recognize`: Show the player's position before the loss and ask which piece is in danger.
2. `predict`: Ask what legal capture or forcing sequence the opponent threatens.
3. `choose`: Present the played move and two engine-verified alternatives; ask for the best practical response.
4. `explain`: Ask the player to choose the reason the response works from bounded concepts.
5. `apply`: Present a related validated position without revealing the theme.

### Validation

- Square and piece answers are validated from the stored position.
- Threats and candidate moves must exist in the Stockfish fact packet.
- Multiple acceptable moves are supported when their evaluation falls within the playbook tolerance.
- Generated feedback may explain the result but cannot change whether the answer passes.

### Progression

- Pass: correct recognize, predict, and choose steps plus a correct transfer position.
- Repeat: one incorrect core step with correct response after feedback.
- Remediate: two incorrect core steps or an unrecognized transfer position.
- Stop: position facts fail validation or the playbook version is unavailable.

### Reinforcement

The next focus game favors an opening branch and opponent behavior likely to create piece-pressure decisions. It does not force an illegal or obviously artificial blunder. Difficulty remains governed by the separate bounded Elo policy.

## 7. Predictability controls

- Playbook selection is a pure deterministic function.
- Every run pins an immutable playbook version.
- Every step has a closed input and output schema.
- Every generated fact must match an allowed fact packet value.
- Temperature and other generation settings are fixed by approved configuration.
- Output length and retry count are bounded.
- Invalid output falls back without changing the state graph.
- Learner scoring and state transitions are deterministic.
- The run stores input hashes, provenance, validation results, and transition history.
- Golden fixtures compare progression across on-device, cloud, and fallback content paths.

## 8. Authoring and release process

1. Define one objective and its observable success criterion.
2. Specify trigger evidence and prerequisites.
3. Select the minimum required step sequence.
4. Define allowed facts, answer schemas, validators, and rubric.
5. Provide deterministic content for every slot.
6. Add representative player positions and adversarial fixtures.
7. Test progression, remediation, and fallback equivalence.
8. Conduct a human chess and teaching review.
9. Publish an immutable version in the playbook registry.
10. Enable the version through validated configuration.

No playbook reaches production based only on generated examples or a successful demo.

## 9. MVP playbook set

Start with four playbooks that cover common, testable weaknesses:

- hanging pieces and loose-piece awareness
- one-move tactical threats
- premature central pawn exchanges
- basic king safety and development

Each playbook must have deterministic fallback content, golden positions, transition tests, and a next-game reinforcement rule before release.

## 10. Acceptance criteria

- Identical evidence selects the same playbook version.
- Identical learner answers produce the same scores, transitions, mastery evidence, and reinforcement.
- On-device, cloud, and fallback wording paths produce equivalent lesson behavior.
- No displayed chess claim escapes fact validation.
- No agent output directly changes mastery, difficulty, or progression.
- Every completed run can be replayed from its stored inputs and versioned playbook.
