# Autonomous Agent (TypeScript)

This is a basic autonomous reasoning agent built from scratch in
TypeScript.

I'm trying to understand how agent systems work
internally instead of using existing frameworks.

------------------------------------------------------------------------

## What It Has

-   Provider Agnostic\
-   Model router layer\
-   Iterative reasoning loop\
-   Structured JSON response format\
-   Max iteration limit\
-   Clean separation between provider and agent logic

The agent runs in a loop until it decides to return a final answer.

------------------------------------------------------------------------

## Reasoning Loop

Each reasoning step must return JSON in this format:

{ "thought": "model reasoning", "action": "continue \| final", "answer":
"string or null" }

The loop continues while `action = continue`.

The loop stops when: - `action = final` - or max iterations are reached

------------------------------------------------------------------------

## Setup

1.  Install dependencies

npm install

2.  Create `.env` as per `.env.example` 


3.  Run

npm run dev

------------------------------------------------------------------------

This project is mainly for learning and experimenting with agent
architectures at a low level.
