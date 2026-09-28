// pg_prove mounts test files, not adjacent migration files. Inline the exact
// reviewed migration source before copying a rollback fixture into its target.
export function expandSqlTestSource(source, readMigration) {
  return source.split('\n').map(line => {
    if (!/^\s*\\(?:i|ir|include|include_relative)\b/.test(line)) return line;
    const match = /^\\ir \.\.\/migrations\/([0-9]{14}_[a-z0-9_]+\.sql)\s*$/.exec(line);
    if (!match) throw new Error('REFUSED: SQL test include must name one repository migration');
    const migration = readMigration(match[1]);
    if (typeof migration !== 'string' || /^\s*\\(?:i|ir|include|include_relative)\b/m.test(migration)) {
      throw new Error('REFUSED: missing or nested SQL migration include');
    }
    return `-- BEGIN repository migration ${match[1]}\n${migration}\n-- END repository migration ${match[1]}`;
  }).join('\n');
}
