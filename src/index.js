/**
 * SchemaEvolution - JSON Schema版本演进引擎
 * DAG版本管理、可逆迁移、自动数据变换
 */

export const MigrationDirection = {
  UP: 'up',
  DOWN: 'down'
};

export class SchemaRegistry {
  constructor() {
    this.versions = new Map();
    this.migrations = new Map();
    this.versionGraph = new Map();
  }

  register(version, schema) {
    this.versions.set(version, schema);
    if (!this.versionGraph.has(version)) {
      this.versionGraph.set(version, new Set());
    }
    return this;
  }

  addMigration(fromVersion, toVersion, migration) {
    const key = `${fromVersion}->${toVersion}`;
    this.migrations.set(key, migration);
    
    // Build DAG edges
    if (!this.versionGraph.has(fromVersion)) {
      this.versionGraph.set(fromVersion, new Set());
    }
    this.versionGraph.get(fromVersion).add(toVersion);
    
    return this;
  }

  getMigration(fromVersion, toVersion) {
    const key = `${fromVersion}->${toVersion}`;
    return this.migrations.get(key);
  }

  findPath(fromVersion, toVersion) {
    // BFS to find shortest path in DAG
    const queue = [{ version: fromVersion, path: [] }];
    const visited = new Set();

    while (queue.length > 0) {
      const { version, path } = queue.shift();
      
      if (version === toVersion) {
        return path;
      }
      
      if (visited.has(version)) continue;
      visited.add(version);

      const neighbors = this.versionGraph.get(version) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push({ 
            version: neighbor, 
            path: [...path, { from: version, to: neighbor }] 
          });
        }
      }
    }
    return null;
  }
}

export class Migrator {
  constructor(registry) {
    this.registry = registry;
  }

  async migrate(data, fromVersion, toVersion) {
    if (fromVersion === toVersion) return data;
    
    const path = this.registry.findPath(fromVersion, toVersion);
    if (!path) {
      throw new Error(`No migration path from ${fromVersion} to ${toVersion}`);
    }

    let result = data;
    for (const step of path) {
      const migration = this.registry.getMigration(step.from, step.to);
      if (!migration) {
        throw new Error(`Missing migration for ${step.from} -> ${step.to}`);
      }
      
      if (typeof migration.up === 'function') {
        result = await migration.up(result);
      }
    }
    return result;
  }

  async rollback(data, fromVersion, toVersion) {
    if (fromVersion === toVersion) return data;
    
    const path = this.registry.findPath(toVersion, fromVersion);
    if (!path) {
      throw new Error(`No rollback path from ${fromVersion} to ${toVersion}`);
    }

    let result = data;
    // Reverse the path for rollback
    const reversedPath = [...path].reverse();
    for (const step of reversedPath) {
      const migration = this.registry.getMigration(step.from, step.to);
      if (!migration || typeof migration.down !== 'function') {
        throw new Error(`Missing rollback for ${step.from} -> ${step.to}`);
      }
      
      result = await migration.down(result);
    }
    return result;
  }
}

export class BatchMigrator {
  constructor(migrator) {
    this.migrator = migrator;
  }

  async migrateBatch(items, fromVersion, toVersion, options = {}) {
    const { batchSize = 100, concurrency = 4, onProgress } = options;
    const results = [];
    const errors = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchPromises = batch.map(async (item, index) => {
        try {
          const migrated = await this.migrator.migrate(item, fromVersion, toVersion);
          return { index: i + index, success: true, data: migrated };
        } catch (error) {
          return { index: i + index, success: false, error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      if (onProgress) {
        onProgress({ completed: i + batch.length, total: items.length });
      }
    }

    return { results, errors: results.filter(r => !r.success) };
  }
}

export function createSchemaEvolution() {
  const registry = new SchemaRegistry();
  const migrator = new Migrator(registry);
  const batchMigrator = new BatchMigrator(migrator);

  return { registry, migrator, batchMigrator, MigrationDirection };
}

export default {
  SchemaRegistry,
  Migrator,
  BatchMigrator,
  MigrationDirection,
  createSchemaEvolution
};