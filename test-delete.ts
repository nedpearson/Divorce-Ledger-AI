async function run() {
  const fileId = "513c0f44-0708-45a9-a525-9c8b77e4347f";
  const res = await fetch(`http://localhost:5000/api/storage/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      'x-user-id': 'd21c3b35-2a34-49cd-9016-8b7d9f1a331f'
    }
  });
  console.log(res.status, await res.text());
}
run();
