import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { SchemaRegistry, Migrator, BatchMigrator, MigrationDirection, createSchemaEvolution } from '../src/index.js';

describe('SchemaRegistry', () => {
  let registry;

  before(() => {
    registry = new SchemaRegistry();
  });

  it('should register schema versions', () => {
    registry.register('v1', { type: 'object', properties: { name: { type: 'string' } } });
    registry.register('v2', { type: 'object', properties: { name: { type: 'string' }, age: { type: 'number' } } });
    
    assert.ok(registry.versions.has('v1'));
    assert.ok(registry.versions.has('v2'));
  });

  it('should add migrations between versions', () => {
    registry.addMigration('v1', 'v2', {
      up: (data) => ({ ...data, age: 0 }),
      down: (data) => {
        const { age, ...rest } = data;
        return rest;
      }
    });

    const migration = registry.getMigration('v1', 'v2');
    assert.ok(migration);
    assert.ok(typeof migration.up === 'function');
    assert.ok(typeof migration.down === 'function');
  });

  it('should find migration path in DAG', () => {
    registry.register('v1', {});
    registry.register('v2', {});
    registry.register('v3', {});
    registry.addMigration('v1', 'v2', { up: () => {}, down: () => {} });
    registry.addMigration('v2', 'v3', { up: () => {}, down: () => {} });

    const path = registry.findPath('v1', 'v3');
    assert.ok(path);
    assert.strictEqual(path.length, 2);
    assert.strictEqual(path[0].from, 'v1');
    assert.strictEqual(path[0].to, 'v2');
    assert.strictEqual(path[1].from, 'v2');
    assert.strictEqual(path[1].to, 'v3');
  });

  it('should return null for non-existent path', () => {
    const path = registry.findPath('v1', 'v99');
    assert.strictEqual(path, null);
  });
});

describe('Migrator', () => {
  let registry;
  let migrator;

  before(() => {
    registry = new SchemaRegistry();
    migrator = new Migrator(registry);
    
    registry.register('v1', {});
    registry.register('v2', {});
    registry.register('v3', {});
    
    registry.addMigration('v1', 'v2', {
      up: (data) => ({ ...data, age: 18 }),
      down: (data) => {
        const { age, ...rest } = data;
        return rest;
      }
    });
    
    registry.addMigration('v2', 'v3', {
      up: (data) => ({ ...data, email: 'default@example.com' }),
      down: (data) => {
        const { email, ...rest } = data;
        return rest;
      }
    });
  });

  it('should migrate data through multiple versions', async () => {
    const input = { name: 'Alice' };
    const result = await migrator.migrate(input, 'v1', 'v3');
    
    assert.strictEqual(result.name, 'Alice');
    assert.strictEqual(result.age, 18);
    assert.strictEqual(result.email, 'default@example.com');
  });

  it('should rollback data through multiple versions', async () => {
    const input = { name: 'Bob', age: 25, email: 'bob@example.com' };
    const result = await migrator.rollback(input, 'v3', 'v1');
    
    assert.strictEqual(result.name, 'Bob');
    assert.ok(!('age' in result));
    assert.ok(!('email' in result));
  });

  it('should throw error for missing migration path', async () => {
    await assert.rejects(
      migrator.migrate({}, 'v1', 'v99'),
      /No migration path/
    );
  });
});

describe('BatchMigrator', () => {
  let registry;
  let migrator;
  let batchMigrator;

  before(() => {
    registry = new SchemaRegistry();
    migrator = new Migrator(registry);
    batchMigrator = new BatchMigrator(migrator);
    
    registry.register('v1', {});
    registry.register('v2', {});
    registry.addMigration('v1', 'v2', {
      up: (data) => ({ ...data, migrated: true }),
      down: (data) => {
        const { migrated, ...rest } = data;
        return rest;
      }
    });
  });

  it('should migrate batch of items', async () => {
    const items = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' }
    ];

    const { results, errors } = await batchMigrator.migrateBatch(items, 'v1', 'v2');
    
    assert.strictEqual(results.length, 3);
    assert.strictEqual(errors.length, 0);
    assert.ok(results.every(r => r.success && r.data.migrated === true));
  });

  it('should report progress', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: i, name: `Item${i}` }));
    let progressCalls = 0;
    
    await batchMigrator.migrateBatch(items, 'v1', 'v2', {
      batchSize: 2,
      onProgress: () => { progressCalls++; }
    });
    
    assert.ok(progressCalls >= 2);
  });
});

describe('createSchemaEvolution', () => {
  it('should create all components', () => {
    const { registry, migrator, batchMigrator, MigrationDirection } = createSchemaEvolution();
    
    assert.ok(registry instanceof SchemaRegistry);
    assert.ok(migrator instanceof Migrator);
    assert.ok(batchMigrator instanceof BatchMigrator);
    assert.ok(MigrationDirection.UP === 'up');
    assert.ok(MigrationDirection.DOWN === 'down');
  });
});