// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

describe('domain architecture boundary', () => {
  it('has no React, DOM, UI, or third-party runtime imports', () => {
    const directory = join(import.meta.dirname, 'domain');
    for (const name of readdirSync(directory)) {
      if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
      const source = ts.createSourceFile(
        name,
        readFileSync(join(directory, name), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement)) continue;
        expect(ts.isStringLiteral(statement.moduleSpecifier)).toBe(true);
        if (ts.isStringLiteral(statement.moduleSpecifier)) {
          expect(statement.moduleSpecifier.text, name).toMatch(/^\.\/[a-z-]+$/);
        }
      }
    }
  });
});
