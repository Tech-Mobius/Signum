const { spawn, execSync } = require('child_process');
const path = require('path');

console.log('Compiling main and preload TypeScript...');
try {
  execSync('npx tsc', { stdio: 'inherit' });
  console.log('TS Compilation complete.');
} catch (err) {
  console.error('Initial compilation failed. Starting anyway...');
}

console.log('Starting Vite Dev Server...');
const vite = spawn('npx', ['vite'], { 
  shell: true,
  stdio: 'pipe' 
});

let electronStarted = false;

vite.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(`[Vite] ${output.trim()}`);
  
  // Detect when Vite is ready
  if ((output.includes('Local:') || output.includes('localhost:5173')) && !electronStarted) {
    electronStarted = true;
    console.log('Vite is ready. Launching Electron...');
    
    // Spawn Electron
    const electron = spawn('npx', ['electron', '.'], {
      shell: true,
      env: {
        ...process.env,
        NODE_ENV: 'development'
      },
      stdio: 'inherit'
    });

    electron.on('close', () => {
      console.log('Electron closed. Exiting dev server...');
      vite.kill();
      process.exit(0);
    });
  }
});

vite.stderr.on('data', (data) => {
  console.error(`[Vite Error] ${data.toString().trim()}`);
});

process.on('SIGINT', () => {
  vite.kill();
  process.exit(0);
});
