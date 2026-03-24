const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/transactions',
  method: 'GET',
  headers: {
    'x-user-id': 'a538fa83-3e26-4421-ac27-4c9271ad5848',
    'x-environment': 'demo'
  }
};

const req = http.request(options, (res) => {
  let chunks = '';
  res.on('data', d => chunks += d);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(chunks);
      console.log('Status:', res.statusCode);
      if (Array.isArray(parsed)) {
        console.log('Got transactions:', parsed.length);
      } else {
        console.log('Response body:', parsed);
      }
    } catch(e) {
      console.log('Raw:', chunks);
    }
  })
});
req.end();
