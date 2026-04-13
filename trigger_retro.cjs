require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fix() {
  const r = await pool.query(`SELECT * FROM obligation_rules WHERE keywords ILIKE '%Atmos%' AND is_active = true LIMIT 1;`);
  
  const rule = r.rows[0];
  if (!rule) {
    console.log('Rule not found');
    return pool.end();
  }

  console.log('Found rule:', rule);

  const keywords = rule.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
  
  const docs = await pool.query(`SELECT id, document_id, vendor, amount, start_date, description FROM expenses WHERE environment = 'live'`);
  
  let count = 0;
  for (const doc of docs.rows) {
      if (!doc.start_date) continue;
      const isAfter = new Date(doc.start_date) >= new Date(rule.effective_start_date);
      if (!isAfter) continue;
      
      const txt = `${doc.vendor || ''} ${doc.description || ''}`.toLowerCase();
      if (keywords.some(k => txt.includes(k))) {
          console.log(`Matched expense ${doc.vendor} for ${doc.amount}`);
          const amountGross = rule.rule_type === 'fixed_amount' && rule.fixed_amount ? rule.fixed_amount : Number(doc.amount);
          
          let partyAOwed = null;
          let partyBOwed = null;
          if (rule.rule_type === 'percentage_split') {
            if (rule.party_a_percentage) partyAOwed = Math.round(amountGross * (rule.party_a_percentage / 100));
            if (rule.party_b_percentage) partyBOwed = Math.round(amountGross * (rule.party_b_percentage / 100));
          }

          try {
             await pool.query(`INSERT INTO obligation_instances 
                (id, case_id, document_id, rule_id, category, vendor, amount_gross, party_a_owed, party_b_owed, due_date, review_status, environment) 
                VALUES 
                (gen_random_uuid(), 'pending-assignment', $1, $2, $3, $4, $5, $6, $7, $8, 'needs_review', 'live')`,
                [doc.document_id || doc.id, rule.id, rule.category, doc.vendor || 'Auto', amountGross, partyAOwed, partyBOwed, doc.start_date]
             );
             count++;
          } catch(e) {
             console.error('Insert error', e.message);
          }
      }
  }
  
  console.log(`Inserted ${count} retroactive instances.`);
  pool.end();
}
fix().catch(console.error);
