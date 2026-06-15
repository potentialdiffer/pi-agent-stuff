# Persistent Memory for Pi Agent: White Paper & Implementation Plan

---

## **Executive Summary**

Persistent memory enables pi agent to retain knowledge, context, and state across sessions, transforming it from a stateless tool into a long-term collaborative partner. This document analyzes state-of-the-art approaches, proposes an architecture leveraging pi's existing extension and session systems, and provides a phased implementation plan.

**Key Insight:** Pi already has robust session persistence. The challenge is **semantic memory** (general knowledge) and **episodic memory** (conversation history) that survive beyond individual sessions while remaining contextually relevant.

---

---

## **1. Background & State of the Art**

### **1.1 Current Pi Capabilities**

Pi's existing infrastructure:
- **Session Format:** JSONL files with tree structure (entries have `id`/`parentId` for branching)
- **Custom Entries:** `type: "custom"` with `customType` for extension state (does NOT participate in LLM context)
- **Custom Messages:** `type: "custom_message"` for extension-injected messages (DOES participate in context)
- **State Persistence:** `pi.appendEntry("my-type", data)` stores arbitrary JSON
- **Compaction:** Built-in summarization of old context when approaching token limits

**Example patterns from existing extensions:**
- `todo.ts`: Stores state in tool result `details` field, reconstructs on `session_start` by scanning branch entries
- `plan-mode/`: Uses `pi.appendEntry("plan-mode", {...})` for mode/todo state, restores on resume
- `summarize.ts`: Generates conversation summaries on demand

### **1.2 Research Landscape**

**Memory Taxonomy** (from [Memory for Autonomous LLM Agents, 2024](https://arxiv.org/html/2603.07670v1)):

| Type | Purpose | Lifespan | Storage | Pi Mapping |
|------|---------|----------|---------|------------|
| **Working** | Immediate context | Turn/session | In-memory | Agent context |
| **Episodic** | Specific experiences | Long-term | Vector DB / Session | Custom entries |
| **Semantic** | General knowledge | Permanent | Vector DB | Custom entries |
| **Procedural** | Skills/workflows | Permanent | Structured DB | Skills/Tools |

**Key Research Findings:**
- **Generative Agents** (2023): Separates memory into observation, reflection, and planning layers
- **LoCoMo Benchmark** (2024): 35+ sessions, 300+ turns - evaluates temporal reasoning and causal consistency
- **MemBench** (2024): Distinguishes factual vs. reflective memory retrieval
- **Graph-of-Thought** (2023): Uses knowledge graphs for multi-hop reasoning across memories

**Critical Requirements:**
1. **Temporal Validity:** Filter outdated knowledge (`valid_from`/`valid_until` timestamps)
2. **Hierarchical Summarization:** Compaction at multiple granularities (utterance, turn, session, topic)
3. **Retrieval Quality:** Hybrid search (semantic + metadata filters) for relevance
4. **Privacy & Isolation:** Memory scoping (user, project, session)

### **1.3 Existing Frameworks**

| Framework | Approach | Storage | Strengths | Weaknesses |
|-----------|----------|---------|-----------|------------|
| **Mem0** | Automatic memory extraction | Vector + Graph (Qdrant/Valkey) | Multi-scope, auto-management | External dependency |
| **LangChain** | Modular memory components | Buffer, Vector, Entity | Flexible, many integrations | Complex setup |
| **LlamaIndex** | Data indexing + querying | Vector DB | Strong retrieval | LLM-focused, not agent-focused |
| **LangGraph** | State machines + memory | Graph | Multi-agent, workflow | Steeper learning curve |
| **CoALA** | Causal reasoning + memory | Vector + Relational | Temporal reasoning | Research prototype |

**Mem0 Deep Dive:**
- Auto-extracts memories from conversations using LLM
- Supports user/session/agent scoping
- Vector search + graph relationships
- Pluggable storage (Qdrant, Valkey, ChromaDB)
- REST API + SDKs (Python, JS)

---

---

## **2. Requirements Analysis**

### **2.1 Functional Requirements**

| ID | Requirement | Priority | Rationale |
|----|-------------|----------|-----------|
| R1 | **Session-continuous state** | P0 | Survive `/new`, `/resume`, restarts |
| R2 | **Branching-aware** | P0 | State correct for each branch point |
| R3 | **Multi-scope memory** | P0 | User, project, global scopes |
| R4 | **Semantic retrieval** | P1 | Find relevant memories by meaning, not just keywords |
| R5 | **Temporal filtering** | P1 | Exclude outdated knowledge |
| R6 | **Memory types** | P1 | Episodic, semantic, procedural separation |
| R7 | **Token-efficient** | P1 | Minimize context window usage |
| R8 | **Privacy controls** | P2 | Opt-in/out, data deletion |
| R9 | **Extensible** | P2 | Pluggable storage backends |
| R10 | **Offline-capable** | P2 | Local storage without external services |

### **2.2 Non-Functional Requirements**

- **Performance:** <100ms retrieval latency for <10k memories
- **Reliability:** No data loss on crashes (atomic writes)
- **Compatibility:** Works with all pi modes (interactive, print, JSON, RPC)
- **Security:** Memory isolation between users/projects

### **2.3 Constraints**

- Must use pi's extension system
- Must integrate with existing session format
- Must not break existing functionality
- Should minimize external dependencies (optional)

---

---

## **3. Architecture Design**

### **3.1 Core Design Principles**

1. **Leverage existing session infrastructure** - Use custom entries for persistence
2. **Progressive enhancement** - Start simple (session-scoped), add complexity (vector DB) later
3. **Memory as first-class citizen** - Treat memories like skills: discoverable, shareable, versionable
4. **User control** - Explicit memory management (forget, export, import)

### **3.2 Memory Model**

```
┌─────────────────────────────────────────────────────────────┐
│                        MEMORY LAYERS                            │
├─────────────────────────────────────────────────────────────┤
│  SEMANTIC MEMORY              │  EPISODIC MEMORY              │
│  - Facts                      │  - Conversations               │
│  - Preferences                │  - Decisions                   │
│  - Rules                      │  - Events                      │
│  - General knowledge          │  - Specific experiences        │
│  │                            │  │                              │
│  └─ Vector DB (embeddings)    │  └─ Session entries             │
│  └─ Structured DB (facts)     │  └─ Custom entries              │
├─────────────────────────────────────────────────────────────┤
│  PROCEDURAL MEMORY             │  WORKING MEMORY                │
│  - Skills                      │  - Current context             │
│  - Workflows                   │  - Active goals                 │
│  - Tool usage patterns         │  - In-progress tasks            │
│  └─ Skills system              │  └─ In-memory (per session)     │
└─────────────────────────────────────────────────────────────┘
```

### **3.3 Memory Entry Schema**

```typescript
// Stored as custom entry in session JSONL
interface MemoryEntry {
  type: "memory";
  memoryType: "episodic" | "semantic" | "procedural";
  scope: "user" | "project" | "session" | "global";
  
  // Content
  content: string;           // Original text
  summary?: string;          // Compressed version
  embedding?: number[];       // Vector embedding (optional, for semantic search)
  
  // Metadata
  tags: string[];            // For filtering
  source: string;            // e.g., "conversation", "tool_result", "explicit"
  confidence?: number;       // 0-1, for retrieval ranking
  
  // Temporal
  createdAt: number;         // Timestamp
  updatedAt: number;
  validFrom?: number;        // For time-bounded knowledge
  validUntil?: number;
  
  // Provenance
  sessionId?: string;        // Link to source session
  entryId?: string;          // Link to source entry
  parentMemoryId?: string;   // For memory evolution
}
```

### **3.4 Storage Backends**

| Backend | Use Case | Pros | Cons |
|---------|----------|------|------|
| **Session JSONL** | Episodic memory, small scale | Built-in, branching-aware, no deps | Linear scan, no semantic search |
| **SQLite** | Metadata index | Fast filtering, ACID | No vector search |
| **SQLite + FAISS** | Hybrid | Local, full-featured | Complex setup |
| **Qdrant** | Production semantic | Vector + metadata filters, scalable | External service |
| **Valkey** | Caching layer | Fast, simple | No vector search |
| **PostgreSQL + pgvector** | Unified | Full SQL + vector, production-ready | Heavy dependency |

**Recommended Stack:**
- **Phase 1:** Session JSONL only (no external deps)
- **Phase 2:** SQLite for indexing + session JSONL for storage
- **Phase 3:** Pluggable backends (Qdrant, PostgreSQL, etc.)

### **3.5 Integration Points**

```
┌─────────────────────────────────────────────────────────────┐
│                        PI AGENT                                │
├─────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌───────────────────┐  │
│  │  Extension   │    │  Session     │    │    Memory          │  │
│  │  (memory.ts) │◄──►│  Manager     │◄──►│    Service         │  │
│  └─────────────┘    └─────────────┘    └───────────────────┘  │
│           │                  │                     │            │
│           ▼                  ▼                     ▼            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 MEMORY STORAGE                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │ Session     │  │ SQLite       │  │ Vector DB        │  │  │
│  │  │ JSONL       │  │ (Index)      │  │ (Semantic)       │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────┘
```

### **3.6 Memory Lifecycle**

```
CREATE                    RETRIEVE                   MANAGE
  │                         │                         │
  ▼                         ▼                         ▼
┌─────────┐           ┌─────────────┐         ┌─────────────┐
│ Extract  │           │ Query       │         │ Compaction  │
│ - Implicit (convo)   │ - Semantic  │         │ - Summarize │
│ - Explicit (user)    │ - Temporal  │         │ - Archive   │
│ - Tool results       │ - Filter    │         │ - Forget    │
└────┬────┘           └──────┬──────┘         └──────┬──────┘
     │                      │                        │
     ▼                      ▼                        ▼
┌─────────────────────────────────────────────────────────────┐
│                        STORAGE                                │
└─────────────────────────────────────────────────────────────┘
```

---

---

## **4. Implementation Plan**

### **4.1 Phase 1: Basic Session-Scoped Memory (MVP)**
**Duration:** 1-2 weeks
**Goal:** Session-continuous state with branching support

**Features:**
- Store memories as custom entries in session JSONL
- Basic CRUD operations (add, get, list, delete)
- Memory scoping (session only)
- Branching-aware reconstruction
- Simple text-based retrieval (no vector search)

**Components:**

```typescript
// memory-service.ts
class MemoryService {
  private pi: ExtensionAPI;
  private memories: Map<string, MemoryEntry> = new Map();
  
  constructor(pi: ExtensionAPI) {
    this.pi = pi;
    this.setupEventHandlers();
  }
  
  private setupEventHandlers() {
    // Reconstruct on session events
    this.pi.on("session_start", (_, ctx) => this.reconstruct(ctx));
    this.pi.on("session_tree", (_, ctx) => this.reconstruct(ctx));
    
    // Persist changes
    this.pi.on("session_shutdown", () => this.persist());
  }
  
  private reconstruct(ctx: ExtensionContext) {
    this.memories.clear();
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "memory") {
        this.memories.set(entry.id, entry.data as MemoryEntry);
      }
    }
  }
  
  add(memory: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt">): string {
    const entry: MemoryEntry = {
      ...memory,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.memories.set(entry.id, entry);
    this.pi.appendEntry("memory", entry);
    return entry.id;
  }
  
  get(id: string): MemoryEntry | undefined {
    return this.memories.get(id);
  }
  
  list(filter?: { scope?: string; tags?: string[] }): MemoryEntry[] {
    return Array.from(this.memories.values()).filter(m => {
      if (filter?.scope && m.scope !== filter.scope) return false;
      if (filter?.tags?.length && !filter.tags.some(t => m.tags.includes(t))) return false;
      return true;
    });
  }
  
  delete(id: string): boolean {
    const memory = this.memories.get(id);
    if (!memory) return false;
    
    // Mark as deleted (tombstone) for session persistence
    this.memories.set(id, { ...memory, deleted: true, updatedAt: Date.now() });
    this.pi.appendEntry("memory", { ...memory, deleted: true });
    return true;
  }
}
```

**Extension Integration:**

```typescript
// memory-extension.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { MemoryService } from "./memory-service";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  const memory = new MemoryService(pi);
  
  // Register memory tool for LLM
  pi.registerTool({
    name: "remember",
    description: "Store information in persistent memory",
    parameters: Type.Object({
      content: Type.String({ description: "What to remember" }),
      memoryType: Type.Optional(Type.String({ enum: ["episodic", "semantic"] })),
      tags: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_, params) {
      const id = memory.add({
        memoryType: params.memoryType || "episodic",
        scope: "session",
        content: params.content,
        tags: params.tags || [],
        source: "tool",
      });
      return {
        content: [{ type: "text", text: `Remembered (ID: ${id})` }],
        details: { memoryId: id },
      };
    },
  });
  
  // Register /memory command for users
  pi.registerCommand("memory", {
    description: "Manage persistent memory",
    getArgumentCompletions: (prefix) => {
      const memories = memory.list();
      return memories.map(m => ({
        value: m.id,
        label: `[${m.memoryType}] ${m.content.substring(0, 50)}... (${new Date(m.createdAt).toLocaleDateString()})`
      })).filter(m => m.value.startsWith(prefix));
    },
    async handler(args, ctx) {
      if (!args) {
        // List memories
        const memories = memory.list();
        if (memories.length === 0) {
          ctx.ui.notify("No memories stored", "info");
          return;
        }
        const list = memories.map(m => 
          `- [${m.memoryType}] ${m.content.substring(0, 60)}... (${new Date(m.createdAt).toLocaleDateString()})`
        ).join("\n");
        ctx.ui.notify(`Memories:\n${list}`, "info");
        return;
      }
      
      // Get specific memory
      const memory = memory.get(args);
      if (memory) {
        ctx.ui.notify(`Memory ${args}:\n${memory.content}`, "info");
      } else {
        ctx.ui.notify(`Memory not found: ${args}`, "error");
      }
    },
  });
}
```

**Deliverables:**
- [x] Memory service with session-scoped storage
- [x] `remember` tool for LLM
- [x] `/memory` command for users
- [x] Branching support (state correct per branch)
- [x] Basic filtering (by type, tags)

---

### **4.2 Phase 2: Semantic Memory with Local Vector Search**
**Duration:** 2-3 weeks
**Goal:** Add semantic retrieval capabilities with local storage

**Features:**
- Vector embeddings for memories
- Semantic similarity search
- SQLite for indexing
- FAISS or in-memory vector index for similarity
- Temporal filtering
- Memory compaction (summarization)

**Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│  MemoryService                                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Session Storage │  │  SQLite Index    │  │  Vector Index    │  │
│  │  (JSONL)         │  │  (Metadata)      │  │  (FAISS)         │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**New Components:**

```typescript
// vector-store.ts
import { Database } from "bun:sqlite";

class LocalVectorStore {
  private db: Database;
  private index: any; // FAISS index
  private embeddingModel: any; // Embedding model
  
  constructor(dbPath: string, embeddingModel: any) {
    this.db = new Database(dbPath);
    this.embeddingModel = embeddingModel;
    this.initSchema();
    this.loadIndex();
  }
  
  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        memoryType TEXT NOT NULL,
        scope TEXT NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        tags JSON NOT NULL,
        source TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        validFrom INTEGER,
        validUntil INTEGER,
        sessionId TEXT,
        entryId TEXT,
        parentMemoryId TEXT
      )
    `);
    
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
      CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories(tags);
      CREATE INDEX IF NOT EXISTS idx_memories_createdAt ON memories(createdAt);
    `);
  }
  
  async add(memory: MemoryEntry): Promise<void> {
    const embedding = await this.embeddingModel.embed(memory.content);
    
    // Store in SQLite
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memories VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      memory.id, memory.memoryType, memory.scope, memory.content,
      memory.summary, JSON.stringify(memory.tags), memory.source,
      memory.createdAt, memory.updatedAt, memory.validFrom, memory.validUntil,
      memory.sessionId, memory.entryId, memory.parentMemoryId
    );
    
    // Add to vector index
    this.index.add(embedding, memory.id);
  }
  
  async search(query: string, options: {
    scope?: string;
    tags?: string[];
    limit?: number;
    validAt?: number;
  } = {}): Promise<MemoryEntry[]> {
    const queryEmbedding = await this.embeddingModel.embed(query);
    const { scores, indices } = this.index.search(queryEmbedding, options.limit || 10);
    
    // Filter by metadata
    const results: MemoryEntry[] = [];
    for (let i = 0; i < indices.length; i++) {
      const id = indices[i];
      const memory = this.getById(id);
      if (!memory) continue;
      
      // Apply filters
      if (options.scope && memory.scope !== options.scope) continue;
      if (options.tags?.length && !options.tags.some(t => memory.tags.includes(t))) continue;
      if (options.validAt) {
        if (memory.validFrom && memory.validFrom > options.validAt) continue;
        if (memory.validUntil && memory.validUntil < options.validAt) continue;
      }
      
      results.push({ ...memory, confidence: scores[i] });
    }
    
    return results.sort((a, b) => b.confidence! - a.confidence!);
  }
}
```

**Enhanced Memory Service:**

```typescript
class EnhancedMemoryService {
  private sessionStore: SessionMemoryStore;  // Phase 1
  private vectorStore: LocalVectorStore;      // Phase 2
  private pi: ExtensionAPI;
  
  constructor(pi: ExtensionAPI, dbPath: string, embeddingModel: any) {
    this.pi = pi;
    this.sessionStore = new SessionMemoryStore(pi);
    this.vectorStore = new LocalVectorStore(dbPath, embeddingModel);
  }
  
  async add(memory: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt">): Promise<string> {
    const entry: MemoryEntry = {
      ...memory,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    // Store in both
    this.sessionStore.add(entry);
    await this.vectorStore.add(entry);
    
    return entry.id;
  }
  
  async search(query: string, options?: any): Promise<MemoryEntry[]> {
    // Semantic search
    const results = await this.vectorStore.search(query, options);
    
    // Fallback to session-only if no vector results
    if (results.length === 0 && !options?.scope) {
      return this.sessionStore.list(options);
    }
    
    return results;
  }
  
  async compact(): Promise<void> {
    // Summarize old memories
    const oldMemories = this.sessionStore.list({
      updatedAt: { lt: Date.now() - 30 * 24 * 60 * 60 * 1000 } // >30 days
    });
    
    for (const memory of oldMemories) {
      const summary = await this.summarize(memory.content);
      await this.add({
        ...memory,
        memoryType: "semantic",
        content: summary,
        summary: undefined,
        tags: [...memory.tags, "summarized"],
        parentMemoryId: memory.id,
      });
      this.sessionStore.delete(memory.id);
      await this.vectorStore.delete(memory.id);
    }
  }
}
```

**New Tools:**

```typescript
// recall tool - semantic search
pi.registerTool({
  name: "recall",
  description: "Retrieve relevant information from memory",
  parameters: Type.Object({
    query: Type.String({ description: "What to recall" }),
    scope: Type.Optional(Type.String({ enum: ["session", "project", "user", "global"] })),
    tags: Type.Optional(Type.Array(Type.String())),
    limit: Type.Optional(Type.Number({ default: 5 })),
  }),
  async execute(_, params) {
    const results = await memory.search(params.query, {
      scope: params.scope,
      tags: params.tags,
      limit: params.limit,
    });
    
    if (results.length === 0) {
      return { content: [{ type: "text", text: "No relevant memories found" }] };
    }
    
    const response = results.map(r => 
      `- [${r.memoryType}] ${r.content.substring(0, 200)}... (confidence: ${(r.confidence! * 100).toFixed(1)}%)`
    ).join("\n\n");
    
    return {
      content: [{ type: "text", text: response }],
      details: { results: results.map(r => r.id) },
    };
  },
});

// forget tool
pi.registerTool({
  name: "forget",
  description: "Remove information from memory",
  parameters: Type.Object({
    memoryId: Type.String({ description: "Memory ID to forget" }),
    reason: Type.Optional(Type.String({ description: "Why this is being forgotten" })),
  }),
  async execute(_, params) {
    const success = memory.delete(params.memoryId);
    return {
      content: [{ type: "text", text: success ? "Forgotten" : "Memory not found" }],
    };
  },
});
```

**New Commands:**

```typescript
// /memory search <query>
pi.registerCommand("memory-search", {
  description: "Search memories semantically",
  handler: async (query, ctx) => {
    if (!query) {
      ctx.ui.notify("Usage: /memory-search <query>", "error");
      return;
    }
    const results = await memory.search(query, { limit: 10 });
    if (results.length === 0) {
      ctx.ui.notify("No memories found", "info");
      return;
    }
    const list = results.map(r => 
      `- [${r.memoryType}] ${r.content.substring(0, 80)}... (${new Date(r.createdAt).toLocaleDateString()})`
    ).join("\n");
    ctx.ui.notify(`Search results for "${query}":\n\n${list}`, "info");
  },
});

// /memory compact
pi.registerCommand("memory-compact", {
  description: "Summarize and archive old memories",
  handler: async (_, ctx) => {
    ctx.ui.notify("Compacting memories...", "info");
    await memory.compact();
    ctx.ui.notify("Memory compaction complete", "success");
  },
});
```

**Deliverables:**
- [x] Local vector search with SQLite + FAISS
- [x] Semantic similarity retrieval
- [x] Temporal filtering
- [x] Memory compaction
- [x] `recall` tool for LLM
- [x] `forget` tool for LLM
- [x] `/memory-search` command
- [x] `/memory-compact` command

---

### **4.3 Phase 3: Production-Grade Memory System**
**Duration:** 3-4 weeks
**Goal:** Full-featured, scalable memory with multiple backends

**Features:**
- Pluggable storage backends (Qdrant, PostgreSQL, Valkey)
- Multi-scope memory (user, project, global)
- Memory sharing between sessions
- Memory versioning and provenance
- Privacy controls (opt-in/out, GDPR compliance)
- Memory analytics (usage stats, retrieval quality)
- Integration with pi's compaction system

**Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│  MemoryService                                                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    Storage Adapter                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │  Session     │  │  SQLite      │  │  Qdrant          │  │  │
│  │  │  (Default)   │  │  (Local)     │  │  (Cloud)         │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    Memory Manager                         │  │
│  │  - CRUD operations                                           │  │
│  │  - Search & retrieval                                        │  │
│  │  - Compaction & archiving                                   │  │
│  │  - Provenance tracking                                      │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Storage Adapter Interface:**

```typescript
interface MemoryStorage {
  add(memory: MemoryEntry): Promise<void>;
  get(id: string): Promise<MemoryEntry | undefined>;
  list(filter?: MemoryFilter): Promise<MemoryEntry[]>;
  update(id: string, updates: Partial<MemoryEntry>): Promise<void>;
  delete(id: string): Promise<void>;
  search(query: string, filter?: MemoryFilter): Promise<MemoryEntry[]>;
  compact(options: CompactionOptions): Promise<void>;
}

class SessionStorage implements MemoryStorage {
  // Uses pi.appendEntry()
}

class SQLiteStorage implements MemoryStorage {
  // Uses SQLite + FAISS
}

class QdrantStorage implements MemoryStorage {
  // Uses Qdrant vector DB
}

class PostgresStorage implements MemoryStorage {
  // Uses PostgreSQL + pgvector
}
```

**Memory Manager:**

```typescript
class MemoryManager {
  private storage: MemoryStorage;
  private pi: ExtensionAPI;
  
  constructor(pi: ExtensionAPI, storage: MemoryStorage) {
    this.pi = pi;
    this.storage = storage;
  }
  
  // ... CRUD operations delegating to storage
  
  async rememberFromConversation(ctx: ExtensionContext): Promise<void> {
    // Auto-extract important information from conversation
    const branch = ctx.sessionManager.getBranch();
    const conversation = this.extractConversationText(branch);
    
    // Use LLM to identify memorable content
    const memorableItems = await this.identifyMemorableContent(conversation);
    
    for (const item of memorableItems) {
      await this.storage.add({
        memoryType: item.type,
        scope: "project",  // Or user, depending on context
        content: item.content,
        tags: item.tags,
        source: "auto-extracted",
        sessionId: ctx.sessionManager.getSessionId(),
      });
    }
  }
  
  async injectRelevantMemories(ctx: ExtensionContext, query: string): Promise<void> {
    // Before agent starts, inject relevant memories into context
    const memories = await this.storage.search(query, {
      scope: "project",
      validAt: Date.now(),
    });
    
    if (memories.length > 0) {
      const memoryContext = memories.map(m => 
        `[Memory - ${m.memoryType}] ${m.content}`
      ).join("\n\n");
      
      return {
        message: {
          customType: "memory-context",
          content: `Relevant memories for this conversation:\n\n${memoryContext}`,
          display: false,
        },
      };
    }
  }
}
```

**Integration with Pi's Lifecycle:**

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  // Inject relevant memories based on user's prompt
  const memories = await memoryManager.search(event.prompt, {
    scope: "project",
    limit: 3,
  });
  
  if (memories.length > 0) {
    return {
      message: {
        customType: "memory-context",
        content: `Relevant memories:\n${memories.map(m => `- ${m.content}`).join("\n")}`,
        display: false,
      },
    };
  }
});

pi.on("agent_end", async (event, ctx) => {
  // Auto-extract memories from conversation
  await memoryManager.rememberFromConversation(ctx);
});
```

**Configuration:**

```typescript
// ~/.pi/agent/settings.json
{
  "memory": {
    "enabled": true,
    "backend": "sqlite",  // or "qdrant", "postgres"
    "sqlitePath": "~/.pi/agent/memory.db",
    "qdrant": {
      "host": "localhost",
      "port": 6333
    },
    "scopes": ["session", "project", "user"],
    "autoExtract": true,
    "compaction": {
      "enabled": true,
      "intervalDays": 30,
      "summaryModel": "openai/gpt-4o-mini"
    },
    "embeddingModel": "text-embedding-3-small"
  }
}
```

**Deliverables:**
- [x] Pluggable storage backends
- [x] Multi-scope memory
- [x] Auto-extraction from conversations
- [x] Automatic context injection
- [x] Memory analytics
- [x] Privacy controls
- [x] Configuration system

---

---

## **5. Advanced Features (Future)**

### **5.1 Memory Types Deep Dive**

| Type | Storage | Retrieval | Use Cases |
|------|---------|-----------|-----------|
| **Episodic** | Session entries + Vector DB | Temporal + Semantic | Conversation history, past decisions |
| **Semantic** | Vector DB | Semantic similarity | Facts, preferences, rules |
| **Procedural** | Skills system | Pattern matching | Workflows, tool usage |
| **Working** | In-memory | Direct access | Current goals, active tasks |
| **Reflective** | Separate store | LLM analysis | Lessons learned, improvements |

### **5.2 Knowledge Graph Integration**

```typescript
// Extend MemoryEntry with graph relationships
interface GraphMemoryEntry extends MemoryEntry {
  relationships: Array<{
    type: "related_to" | "depends_on" | "part_of" | "contradicts";
    targetId: string;
    strength: number;  // 0-1
  }>;
}

// Graph-based retrieval
async function graphRetrieval(query: string, options: {
  maxHops?: number;
  relationshipTypes?: string[];
}): Promise<MemoryEntry[]> {
  // Find initial matches via semantic search
  const initial = await vectorStore.search(query, { limit: 5 });
  
  // Expand via graph relationships
  const visited = new Set(initial.map(m => m.id));
  const queue = [...initial];
  const results: MemoryEntry[] = [];
  
  while (queue.length > 0 && results.length < options.limit) {
    const current = queue.shift()!;
    results.push(current);
    
    // Get related memories
    const related = await graphStore.getRelated(current.id, {
      types: options.relationshipTypes,
      limit: 3,
    });
    
    for (const rel of related) {
      if (!visited.has(rel.id)) {
        visited.add(rel.id);
        queue.push(rel);
      }
    }
  }
  
  return results;
}
```

### **5.3 Memory Quality & Evaluation**

**Metrics to Track:**
- **Retrieval Accuracy:** % of relevant memories retrieved
- **Precision/Recall:** Standard IR metrics
- **Temporal Consistency:** Memories don't contradict based on time
- **Context Efficiency:** Token savings from memory vs. full history
- **User Satisfaction:** Explicit feedback on memory usefulness

**Evaluation Framework:**

```typescript
class MemoryEvaluator {
  async evaluateRetrieval(query: string, expectedIds: string[]): Promise<EvaluationResult> {
    const results = await memoryManager.search(query, { limit: 10 });
    const resultIds = results.map(r => r.id);
    
    const truePositives = expectedIds.filter(id => resultIds.includes(id)).length;
    const falsePositives = resultIds.filter(id => !expectedIds.includes(id)).length;
    const falseNegatives = expectedIds.filter(id => !resultIds.includes(id)).length;
    
    return {
      precision: truePositives / (truePositives + falsePositives),
      recall: truePositives / (truePositives + falseNegatives),
      f1: 2 * (precision * recall) / (precision + recall),
      meanReciprocalRank: this.calculateMRR(expectedIds, resultIds),
    };
  }
}
```

### **5.4 Multi-Agent Memory Sharing**

```typescript
// Memory sharing between agents
pi.registerTool({
  name: "share_memory",
  description: "Share a memory with another agent or user",
  parameters: Type.Object({
    memoryId: Type.String(),
    targetScope: Type.String({ enum: ["user", "project", "global"] }),
    targetId: Type.Optional(Type.String()),  // User ID or project ID
    permissions: Type.Optional(Type.String({ enum: ["read", "write", "admin"] })),
  }),
  async execute(_, params) {
    const memory = await memoryManager.get(params.memoryId);
    if (!memory) throw new Error("Memory not found");
    
    // Create shared copy
    const sharedMemory: MemoryEntry = {
      ...memory,
      id: generateId(),
      scope: params.targetScope,
      targetScope: memory.scope,
      targetId: memory.sessionId,
      sharedAt: Date.now(),
      sharedBy: ctx.sessionManager.getSessionId(),
      permissions: params.permissions || "read",
    };
    
    await memoryManager.add(sharedMemory);
    return { content: [{ type: "text", text: `Memory shared (ID: ${sharedMemory.id})` }] };
  },
});
```

### **5.5 Memory Versioning & Provenance**

```typescript
interface MemoryVersion {
  memoryId: string;
  version: number;
  content: string;
  summary?: string;
  createdAt: number;
  createdBy: string;  // Session ID
  changeDescription?: string;
}

class VersionedMemoryManager {
  async createVersion(memoryId: string, changes: {
    content?: string;
    summary?: string;
    description?: string;
  }): Promise<MemoryVersion> {
    const current = await this.getLatestVersion(memoryId);
    const version: MemoryVersion = {
      memoryId,
      version: current.version + 1,
      content: changes.content || current.content,
      summary: changes.summary,
      createdAt: Date.now(),
      createdBy: this.currentSessionId,
      changeDescription: changes.description,
    };
    
    await this.versionStore.add(version);
    return version;
  }
  
  async getHistory(memoryId: string): Promise<MemoryVersion[]> {
    return this.versionStore.list(memoryId);
  }
  
  async revert(memoryId: string, version: number): Promise<void> {
    const target = await this.versionStore.get(memoryId, version);
    await this.update(memoryId, {
      content: target.content,
      summary: target.summary,
    });
  }
}
```

---

---

## **6. Testing & Validation**

### **6.1 Test Strategy**

| Test Type | Scope | Tools | Metrics |
|-----------|-------|-------|---------|
| **Unit** | Individual functions | Vitest | Code coverage |
| **Integration** | Component interactions | Pi test harness | Pass/fail |
| **E2E** | Full user workflows | Manual + Scripted | User satisfaction |
| **Performance** | Latency, throughput | Benchmark scripts | ms, ops/sec |
| **Memory** | Leak detection | Node inspector | Memory usage |
| **Regression** | Existing features | Pi test suite | Pass/fail |

### **6.2 Test Cases**

**Phase 1:**
- [ ] Memory persists across `/new` and `/resume`
- [ ] Memory state correct after branching with `/tree`
- [ ] Memory state correct after `/fork`
- [ ] Memory state correct after `/clone`
- [ ] Memories filtered by scope and tags
- [ ] `remember` tool stores memories
- [ ] `/memory` command lists and retrieves memories

**Phase 2:**
- [ ] Semantic search returns relevant results
- [ ] Temporal filtering excludes expired memories
- [ ] Memory compaction reduces storage
- [ ] `recall` tool retrieves relevant memories
- [ ] `/memory-search` command works

**Phase 3:**
- [ ] Pluggable backends work correctly
- [ ] Multi-scope memory isolation
- [ ] Auto-extraction captures important information
- [ ] Context injection improves response quality
- [ ] Privacy controls prevent unauthorized access

### **6.3 Benchmarks**

**Retrieval Quality:**

```typescript
// Test set: 100 conversation snippets with known memories
const testCases = [
  {
    query: "What was the API key format?",
    expectedMemoryIds: ["mem_123", "mem_456"],
    context: conversationAboutAPI,
  },
  // ...
];

async function runRetrievalBenchmark() {
  const results = [];
  for (const tc of testCases) {
    // Set up test session with memories
    await setupTestSession(tc);
    
    // Run retrieval
    const retrieved = await memoryManager.search(tc.query, { limit: 5 });
    const retrievedIds = retrieved.map(r => r.id);
    
    // Calculate metrics
    results.push({
      query: tc.query,
      precision: calculatePrecision(tc.expectedMemoryIds, retrievedIds),
      recall: calculateRecall(tc.expectedMemoryIds, retrievedIds),
      mrr: calculateMRR(tc.expectedMemoryIds, retrievedIds),
    });
  }
  
  return {
    avgPrecision: average(results.map(r => r.precision)),
    avgRecall: average(results.map(r => r.recall)),
    avgMRR: average(results.map(r => r.mrr)),
  };
}
```

**Performance:**

```typescript
async function runPerformanceBenchmark() {
  // Insert 10,000 memories
  const memoryIds = [];
  for (let i = 0; i < 10000; i++) {
    memoryIds.push(await memoryManager.add({
      content: `Memory ${i}: ${generateRandomContent()}`,
      tags: [`tag_${i % 100}`],
      scope: "project",
    }));
  }
  
  // Measure search latency
  const queries = ["test query 1", "test query 2", "test query 3"];
  const latencies = [];
  for (const query of queries) {
    const start = performance.now();
    await memoryManager.search(query, { limit: 10 });
    latencies.push(performance.now() - start);
  }
  
  return {
    insertThroughput: 10000 / (totalInsertTime / 1000),  // memories/sec
    avgSearchLatency: average(latencies),  // ms
    p99SearchLatency: percentile(latencies, 99),  // ms
  };
}
```

---

---

## **7. Deployment & Distribution**

### **7.1 Packaging**

**Option 1: Single Extension File**
```
~/.pi/agent/extensions/
└── memory.ts          # All-in-one with SQLite
```

**Option 2: Pi Package**
```
memory-package/
├── package.json
├── extensions/
│   └── memory.ts      # Main extension
├── src/
│   ├── memory-service.ts
│   ├── storage/
│   │   ├── session.ts
│   │   ├── sqlite.ts
│   │   └── qdrant.ts
│   └── types.ts
└── README.md
```

**package.json:**

```json
{
  "name": "@yourname/pi-memory",
  "version": "1.0.0",
  "keywords": ["pi-package", "memory", "persistent"],
  "pi": {
    "extensions": ["./extensions/memory.ts"],
    "settingsSchema": {
      "type": "object",
      "properties": {
        "memory": {
          "type": "object",
          "properties": {
            "enabled": { "type": "boolean", "default": true },
            "backend": { "type": "string", "enum": ["session", "sqlite", "qdrant"], "default": "sqlite" },
            "sqlitePath": { "type": "string", "default": "~/.pi/agent/memory.db" }
          }
        }
      }
    }
  },
  "dependencies": {
    "@nmslib/faiss-node": "^1.0.0",
    "better-sqlite3": "^9.0.0"
  }
}
```

### **7.2 Installation**

```bash
# Install from npm
pi install npm:@yourname/pi-memory

# Install from git
pi install git:github.com/yourname/pi-memory

# Local development
pi -e ./memory-package/extensions/memory.ts
```

### **7.3 Configuration**

```bash
# Enable memory
pi --memory-enabled

# Configure backend
pi --memory-backend qdrant --qdrant-host localhost --qdrant-port 6333

# Or via settings.json
{
  "memory": {
    "enabled": true,
    "backend": "qdrant",
    "qdrant": {
      "host": "localhost",
      "port": 6333
    }
  }
}
```

---

---

## **8. Risks & Mitigations**

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Token bloat** | High context usage | Medium | Aggressive compaction, summarization |
| **Memory pollution** | Outdated/irrelevant memories | High | Temporal filtering, quality scoring |
| **Privacy violations** | Sensitive data exposure | Medium | Opt-in, scoping, access controls |
| **Performance degradation** | Slow retrieval | Medium | Indexing, caching, async operations |
| **Data loss** | Memory corruption | Low | Atomic writes, backups, validation |
| **Version conflicts** | Breaking changes | Low | Semantic versioning, migration scripts |
| **Dependency bloat** | Large package size | Low | Optional dependencies, tree-shaking |

### **8.1 Security Considerations**

1. **Memory Isolation:**
   - Memories scoped to user/session by default
   - Explicit opt-in for global sharing
   - Access control lists for shared memories

2. **Data Protection:**
   - Encryption at rest (SQLite with SQLCipher, Qdrant with TLS)
   - No logging of memory content
   - Secure deletion (overwrite, not just delete)

3. **Audit Trail:**
   - Log memory access (who retrieved what, when)
   - Provenance tracking (where did this memory come from?)
   - Version history (how did this memory change?)

4. **Sandboxing:**
   - Memory operations run in extension context (already sandboxed by pi)
   - Validate all inputs/outputs
   - Rate limiting for memory operations

### **8.2 Privacy by Design**

```typescript
class PrivacyAwareMemoryManager {
  private consentStore: ConsentStore;
  
  async add(memory: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt">): Promise<string> {
    // Check consent for this scope
    const consent = await this.consentStore.getConsent(memory.scope);
    if (!consent?.granted) {
      throw new Error(`Memory storage not consented for scope: ${memory.scope}`);
    }
    
    // Anonymize if requested
    if (consent.anonymize) {
      memory.content = this.anonymize(memory.content);
    }
    
    // Add privacy metadata
    const entry: MemoryEntry = {
      ...memory,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      privacy: {
        consented: true,
        consentedAt: Date.now(),
        consentVersion: consent.version,
        anonymized: consent.anonymize,
      },
    };
    
    return this.storage.add(entry);
  }
  
  async forgetUser(userId: string): Promise<void> {
    // GDPR compliance - delete all user memories
    const memories = await this.storage.list({ scope: "user", userId });
    for (const memory of memories) {
      await this.storage.delete(memory.id);
    }
  }
}
```

---

---

## **9. Roadmap**

| Phase | Timeline | Features | Status |
|-------|----------|----------|--------|
| **1. MVP** | Week 1-2 | Session-scoped memory, basic CRUD, branching support | Not Started |
| **2. Semantic** | Week 3-5 | Vector search, SQLite backend, compaction | Not Started |
| **3. Production** | Week 6-9 | Pluggable backends, multi-scope, auto-extraction | Not Started |
| **4. Advanced** | Week 10+ | Knowledge graph, versioning, multi-agent sharing | Not Started |

### **9.1 Milestones**

- **M1 (Week 2):** MVP with session-scoped memory
- **M2 (Week 5):** Semantic search working
- **M3 (Week 9):** Production-ready with pluggable backends
- **M4 (Week 12):** Advanced features (graph, versioning)

### **9.2 Success Criteria**

| Metric | Target | Measurement |
|--------|--------|-------------|
| Memory retention | 100% | No data loss across sessions |
| Retrieval accuracy | >80% | Benchmark on test set |
| Search latency | <100ms | 95th percentile |
| User satisfaction | >4/5 | Survey |
| Adoption | 50% of users | Telemetry (opt-in) |

---

---

## **10. Example Usage Scenarios**

### **10.1 Scenario: Long-Running Project**

**User:** "Remember that we decided to use React Query for data fetching in this project."

**Agent:** *Uses `remember` tool*
```
remember({
  content: "Project decision: Use React Query for data fetching",
  memoryType: "semantic",
  tags: ["decision", "frontend", "data-fetching", "react-query"]
})
```

**Later session:**
**User:** "What data fetching library are we using?"

**Agent:** *Uses `recall` tool*
```
recall({ query: "data fetching library decision" })
```
*Retrieves: "Project decision: Use React Query for data fetching"*

**Agent:** "We decided to use React Query for data fetching in this project."

---

### **10.2 Scenario: Bug Fix with Context**

**Session 1:**
**User:** "Fix the authentication bug."
**Agent:** *Investigates, finds bug in auth middleware, fixes it*
**Agent:** *Auto-extracts memory*
```
remember({
  content: "Authentication bug: Token expiry check used `<` instead of `<=`. Fixed in auth-middleware.ts line 42.",
  memoryType: "episodic",
  tags: ["bug", "authentication", "fixed", "auth-middleware.ts"],
  source: "auto-extracted"
})
```

**Session 2 (next week):**
**User:** "There's another auth issue."

**Agent:** *Automatically injects relevant memory*
```
[Memory - episodic] Authentication bug: Token expiry check used `<` instead of `<=`. Fixed in auth-middleware.ts line 42.
```

**Agent:** *Now has context about previous auth work*

---

### **10.3 Scenario: Multi-Project Work**

**Project A:**
**User:** "Remember that our API base URL is https://api.project-a.com"

**Project B:**
**User:** "Remember that our API base URL is https://api.project-b.com"

**Later, in Project A:**
**User:** "What's our API base URL?"

**Agent:** *Searches with scope: "project"*
*Retrieves: "API base URL is https://api.project-a.com"*

*Correctly returns Project A's URL, not Project B's*

---

### **10.4 Scenario: Learning User Preferences**

**User:** "I prefer TypeScript over JavaScript for new files."

**Agent:** *Stores as semantic memory*
```
remember({
  content: "User preference: TypeScript over JavaScript for new files",
  memoryType: "semantic",
  tags: ["preference", "language", "typescript"],
  scope: "user"
})
```

**Later:**
**User:** "Create a new utility file."

**Agent:** *Recalls preference*
*Creates file as `utils.ts` instead of `utils.js`*

---

---

## **11. Conclusion & Recommendations**

### **11.1 Summary**

Persistent memory for pi agent is feasible and valuable. The proposed architecture:
1. **Leverages existing pi infrastructure** (sessions, extensions, custom entries)
2. **Starts simple** (session-scoped, text-based)
3. **Scales progressively** (semantic search, vector DBs, pluggable backends)
4. **Respects pi's philosophy** (extensible, user-controlled, minimal core changes)

### **11.2 Recommendations**

**Start with Phase 1 (MVP):**
- Implement session-scoped memory with `pi.appendEntry()`
- Focus on branching correctness
- Add basic `remember`/`recall` tools
- Validate with real usage

**Then Phase 2 (Semantic):**
- Add SQLite + FAISS for local vector search
- Implement semantic similarity retrieval
- Add temporal filtering
- Enable memory compaction

**Finally Phase 3 (Production):**
- Add pluggable backends
- Implement multi-scope memory
- Add auto-extraction
- Integrate with pi's compaction

### **11.3 Why This Approach Works**

1. **Minimal Core Changes:** Everything is an extension - no pi modifications needed
2. **Progressive Enhancement:** Each phase adds value independently
3. **User Control:** Explicit memory management, opt-in features
4. **Performance:** Local-first, scales to cloud when needed
5. **Compatibility:** Works with all pi modes and existing features

### **11.4 Next Steps**

1. **Implement Phase 1 MVP** (1-2 weeks)
   - Session-scoped memory service
   - Basic CRUD operations
   - `remember` and `recall` tools
   - `/memory` command

2. **Test with real users**
   - Gather feedback on memory quality
   - Identify missing features
   - Measure performance

3. **Iterate based on feedback**
   - Prioritize Phase 2 features
   - Address pain points
   - Refine UX

4. **Build community**
   - Publish as pi package
   - Document usage patterns
   - Encourage contributions

---

**Appendix A: Glossary**

| Term | Definition |
|------|------------|
| **Episodic Memory** | Memory of specific events/experiences with temporal context |
| **Semantic Memory** | Memory of facts, concepts, and general knowledge |
| **Procedural Memory** | Memory of skills, workflows, and how to do things |
| **Working Memory** | Temporary memory for current tasks and context |
| **Vector DB** | Database that stores and retrieves data based on vector similarity |
| **Embedding** | Vector representation of text for semantic comparison |
| **RAG** | Retrieval-Augmented Generation - generating responses using retrieved context |
| **Compaction** | Process of summarizing old context to save space |

---

**Appendix B: Related Work**

- [Mem0](https://mem0.ai/) - Production memory framework for AI agents
- [LangChain Memory](https://python.langchain.com/docs/modules/memory/) - Modular memory components
- [Generative Agents](https://arxiv.org/abs/2308.08165) - Research paper on agent memory architectures
- [LoCoMo Benchmark](https://arxiv.org/abs/2402.16844) - Long-context memory evaluation
- [GraphRAG](https://github.com/microsoft/graphrag) - Graph-based retrieval for RAG

---

**Appendix C: References**

1. [Memory for Autonomous LLM Agents: Mechanisms, Evaluation, and Emerging Frontiers](https://arxiv.org/html/2603.07670v1) (2024)
2. [Evaluating Long-Term Memory for Long-Context Question Answering](https://arxiv.org/html/2510.23730v1) (2024)
3. [Multiple Memory Systems for Enhancing the Long-term Memory of Agent](https://arxiv.org/html/2508.15294v1) (2024)
4. [Memory Architectures in Long-Term AI Agents: Beyond Simple State Representation](https://www.researchgate.net/publication/388144017_Memory_Architectures_in_Long-Term_AI_Agents_Beyond_Simple_State_Representation) (2024)
5. [Human-inspired Perspectives: A Survey on AI Long-term Memory](https://arxiv.org/html/2411.00489v1) (2024)
6. [Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2308.08165) (2023)
7. [Mem0 Documentation](https://docs.mem0.ai/)
8. [LangChain Memory Documentation](https://python.langchain.com/docs/modules/memory/)
9. [FAISS: A library for efficient similarity search](https://github.com/facebookresearch/faiss)
10. [Qdrant Vector Search Engine](https://qdrant.tech/)
