import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

async function testUpload() {
  const form = new FormData();
  form.append('file', fs.createReadStream('package.json'));
  form.append('title', 'Test Upload');

  const res = await fetch('http://localhost:5000/api/storage/files/upload', {
    method: 'POST',
    headers: {
      'x-user-id': 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f'
    },
    body: form
  });

  const body = await res.text();
  console.log('Status', res.status);
  console.log('Response', body);
}

testUpload().catch(console.error);
