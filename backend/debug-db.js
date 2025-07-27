import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:../database/local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function testInsert() {
  const testIdea = "我想開發一個功能完整的待辦清單應用程式";
  
  console.log('Test idea:', testIdea);
  console.log('Test idea length:', testIdea.length);
  console.log('Test idea type:', typeof testIdea);
  
  try {
    console.log('Parameters:', [testIdea, '', 'processing']);
    console.log('Parameters types:', [typeof testIdea, typeof '', typeof 'processing']);
    
    // Try with object-style parameters
    const result = await db.execute({
      sql: 'INSERT INTO ideas (user_input, generated_spec, status) VALUES (?, ?, ?)',
      args: [testIdea, '', 'processing']
    });
    
    console.log('Insert successful:', result);
  } catch (error) {
    console.error('Insert failed:', error);
    
    // Try alternative approach
    try {
      console.log('Trying alternative syntax...');
      const result2 = await db.execute(
        'INSERT INTO ideas (user_input, generated_spec, status) VALUES ($1, $2, $3)',
        [testIdea, '', 'processing']
      );
      console.log('Alternative insert successful:', result2);
    } catch (error2) {
      console.error('Alternative insert also failed:', error2);
    }
  }
}

testInsert();