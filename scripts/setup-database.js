#!/usr/bin/env node

import { createClient } from '@libsql/client';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupDatabase() {
  try {
    // Ensure database directory exists
    const dbDir = path.join(__dirname, '..', 'database');
    await fs.mkdir(dbDir, { recursive: true });
    
    console.log('Setting up database...');
    
    // Create database client (local SQLite by default)
    const dbPath = path.join(__dirname, '..', 'database', 'local.db');
    const db = createClient({
      url: `file:${dbPath}`
    });
    
    // Create tables
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ideas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_input TEXT NOT NULL,
        generated_spec TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Database setup completed successfully');
    console.log('📁 Local database created at: database/local.db');
    
    // Insert sample data for testing
    await db.execute(`
      INSERT INTO ideas (user_input, generated_spec) VALUES (
        'Sample idea for testing',
        '# Sample Specification\n\nThis is a sample specification generated for testing purposes.\n\n## Features\n- Feature 1\n- Feature 2\n\n## Requirements\n- Requirement 1\n- Requirement 2'
      )
    `);
    
    console.log('📝 Sample data inserted for testing');
    
  } catch (error) {
    console.error('❌ Error setting up database:', error);
    process.exit(1);
  }
}

setupDatabase();