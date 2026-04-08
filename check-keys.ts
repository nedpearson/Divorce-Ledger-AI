import { documents, legalDocuments } from './shared/schema';

const table = documents || legalDocuments;
console.log("aiAnalysisStatus in table:", 'aiAnalysisStatus' in table);
console.log("status in table:", 'status' in table);
console.log("table keys:", Object.keys(table));
