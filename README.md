# schema-evolution

**Zero-downtime JSON Schema migration engine for JavaScript** — evolve schemas with automated data transformation.

## Problem

APIs, databases, and frontend state evolve daily. Changing JSON Schema means breaking old clients, manual data migrations, and complex version checks. Existing tools require manual codemods per change. `ajv` validates but does not migrate. `zod` transforms but has no versioning.

## Solution

schema-evolution tracks schema versions with a **directed acyclic graph (DAG)**. Each migration is a declarative transform: `{ from: '1.0.0', to: '1.1.0', up: (data) => ..., down: ... }`. The engine composes migrations, detects divergence, and applies **idempotent, reversible, observable** transformations. Works with JSON Schema, TypeScript types, and Zod schemas. Supports streaming migration for large datasets.

```javascript
import { migrate } from 'schema-evolution';

const schema = {
  version: '2.3.0',
  migrations: {
    '1.0.0->1.1.0': data => ({ ...data, createdAt: Date.now() }),
    '1.1.0->2.0.0': data => ({ user: data }),
  }
};

const current = await migrate({
  data: dbRecord,
  targetVersion: '2.3.0',
  schema
});
// Automatically applies 1.0.0 -> 1.1.0 -> 2.0.0 -> 2.3.0
```

## Differentiation

| Feature | schema-evolution | json-schema-upgrade | ajv | Zod |
|---------|------------------|--------------------|-----|-----|
| **Version DAG** | ✅ | ❌ | ❌ | ❌ |
| **Reversible migrations** | ✅ | ❌ | ❌ | ❌ |
| **Streaming transform** | ✅ | ❌ | ❌ | ❌ |
| **Schema-aware validation** | ✅ | ⚠️ | ✅ | ✅ |
| **TypeScript generation** | ✅ | ❌ | ❌ | ✅ |
| **Observability hooks** | ✅ | ❌ | ❌ | ❌ |

## Architecture

- **Version Graph**: `semver` + DAG resolution
- **Transformer Compiler**: AST-based safe transforms
- **Migration Registry**: Persistent store with checksums
- **Batch Migrator**: Streaming for MongoDB, Postgres JSONB, S3
- **Rollback Safety**: Shadow writes + verification

## Quick Start

```bash
npm install schema-evolution
```

```javascript
import { evolve } from 'schema-evolution';

await evolve({ path: './schema.json', version: '2.0.0' });
```

## License

MIT