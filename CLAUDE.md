# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Graph-minton** is a badminton league analytics application. It parses weekly match CSV files, normalizes player names via alias mapping, stores the data in a database, and visualizes player relationships and statistics through a React frontend.

This project is in early stages — the data is defined and the roadmap is set, but implementation is TBD.

## Data

### Scores (`/data/scores/`)
33 weekly CSV files (`Week01.csv` – `Week33.csv`). No header row. Column order:

```
Date, GameNo, A, B, PtsAB, X, Y, PtsXY
```

Example: `08-04-2024,1,Bhavin,Chets,21,Chan,Jayesh,9`
→ Bhavin & Chets beat Chan & Jayesh 21–9 on April 8 2024.

### Aliases (`/data/aliases/`)
One `.txt` file per canonical player name. File name = canonical name. File contents = newline-separated aliases. Example: `Nikhil P.txt` contains `Nik`, `Nikhil`, `Niks`.

When ingesting data, all alias variants must be resolved to the canonical name.

## Planned Tech Stack

- **Backend**: C# (preferred for learning) or Python as fallback
- **Database**: Neo4j (graph DB) or PostgreSQL — not yet decided
- **Frontend**: React

## Roadmap (in order)

1. Ingest all score CSVs with alias normalization → store in DB
2. Query player stats, partnerships, opponent analysis
3. Visualize player network (nodes + edges) and performance over time
4. Anomaly detection (over/underrepresented pairings, mismatched skill levels)
5. Frontend upload flow for scores and aliases (with validation)
6. Auth and multi-user support
